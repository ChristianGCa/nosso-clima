import { randomUUID, randomInt } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const failureCodes = new Map([
  ['Invalid probe configuration', 'configuration_invalid'],
  ['Network request failed', 'network_unavailable'],
  ['Protected Preview access denied', 'protected_access'],
  ['Request rate limited', 'rate_limited'],
  ['Preview fixture marker missing', 'fixture_marker_missing'],
  ['Expected JSON response', 'json_expected'],
  ['Invalid JSON response', 'json_invalid'],
  ['Probe response too large', 'response_too_large'],
  ['Echo report unavailable', 'echo_report_unavailable'],
  ['Invalid echo report', 'echo_report_invalid'],
  ['Echo privacy check failed', 'privacy_sentinel_seen'],
  ['Ingress calibration unavailable', 'ingress_unavailable'],
  ['Invalid ingress calibration', 'ingress_invalid'],
  ['Ingress hides the canary', 'canary_not_preserved'],
  ['Preview preflight failed', 'preflight_failed'],
]);

class ProbeFailure extends Error {
  constructor(message, context) {
    super(message);
    this.context = context;
  }
}

export function formatProbeFailure(error) {
  const code = error instanceof Error ? failureCodes.get(error.message) : undefined;
  const context = error instanceof ProbeFailure ? error.context : undefined;
  const details = [];
  if (['configuration', 'calibration', 'report', 'preflight', 'sample'].includes(context?.stage))
    details.push(`stage=${context.stage}`);
  if (['api_direct', 'web_rewrite', 'echo', 'ingress'].includes(context?.target))
    details.push(`path=${context.target}`);
  if (Number.isInteger(context?.status) && context.status >= 100 && context.status <= 599)
    details.push(`HTTP=${context.status}`);
  if (
    [
      'PROBE_CONFIRM_PREVIEW',
      'PROBE_SCENARIO',
      'UPSTREAM_TEST_TOKEN',
      'PROBE_CANARY',
      'PROBE_API_ORIGIN',
      'PROBE_WEB_ORIGIN',
      'PROBE_REPORT_ORIGIN',
      'PROBE_INGRESS_ORIGIN',
    ].includes(context?.variable)
  )
    details.push(`variable=${context.variable}`);
  return `Preview probe interrupted: ${code ?? 'unexpected_failure'}${details.length ? ` (${details.join(', ')})` : ''}. No operational values were printed.\n`;
}

function origin(value, loopback = false, variable) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ProbeFailure('Invalid probe configuration', { stage: 'configuration', variable });
  }
  if (
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    (url.protocol !== 'https:' &&
      !(loopback && url.protocol === 'http:' && url.hostname === '127.0.0.1'))
  ) {
    throw new ProbeFailure('Invalid probe configuration', { stage: 'configuration', variable });
  }
  return url.origin;
}

async function readJson(response) {
  if (!response.body || !/^application\/json\b/i.test(response.headers.get('content-type') ?? ''))
    throw new Error('Expected JSON response');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 65536) {
        await reader.cancel();
        throw new Error('Probe response too large');
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {
    reader.releaseLock();
  }
}

export async function runPreviewProbe(environment, fetchImpl = fetch) {
  let api, web, echo;
  let ingress;
  const scenario = environment.PROBE_SCENARIO ?? 'normal';
  const token = environment.UPSTREAM_TEST_TOKEN;
  const canary = environment.PROBE_CANARY;
  try {
    const invalid = [
      ['PROBE_CONFIRM_PREVIEW', environment.PROBE_CONFIRM_PREVIEW !== 'isolated-fixtures'],
      ['PROBE_SCENARIO', !['normal', 'fail_closed'].includes(scenario)],
      ['UPSTREAM_TEST_TOKEN', !/^[\w-]{32,256}$/.test(token ?? '')],
      ['PROBE_CANARY', !/^[\w-]{8,100}$/.test(canary ?? '')],
    ].find(([, failed]) => failed);
    if (invalid)
      throw new ProbeFailure('Invalid probe configuration', {
        stage: 'configuration',
        variable: invalid[0],
      });
    api = origin(environment.PROBE_API_ORIGIN, false, 'PROBE_API_ORIGIN');
    web = origin(environment.PROBE_WEB_ORIGIN, false, 'PROBE_WEB_ORIGIN');
    echo = origin(environment.PROBE_REPORT_ORIGIN, true, 'PROBE_REPORT_ORIGIN');
    if (environment.PROBE_INGRESS_ORIGIN)
      ingress = origin(environment.PROBE_INGRESS_ORIGIN, false, 'PROBE_INGRESS_ORIGIN');
    if (api === web || echo === api || echo === web) throw new Error('Invalid configuration');
  } catch (error) {
    if (error instanceof ProbeFailure) throw error;
    throw new Error('Invalid probe configuration');
  }

  async function fetchResponse(stage, target, input, init) {
    try {
      return await fetchImpl(input, init);
    } catch {
      throw new ProbeFailure('Network request failed', { stage, target });
    }
  }
  async function responseJson(stage, target, response) {
    try {
      return await readJson(response);
    } catch (error) {
      const message =
        error instanceof Error &&
        ['Expected JSON response', 'Probe response too large'].includes(error.message)
          ? error.message
          : 'Invalid JSON response';
      throw new ProbeFailure(message, { stage, target, status: response.status });
    }
  }
  async function report() {
    const response = await fetchResponse('report', 'echo', `${echo}/__probe/report`, {
      headers: { authorization: `Bearer ${token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (response.status !== 200)
      throw new ProbeFailure('Echo report unavailable', {
        stage: 'report',
        target: 'echo',
        status: response.status,
      });
    const body = await responseJson('report', 'echo', response);
    if (
      body.kind !== 'nosso-clima-preview-echo-v1' ||
      body.mode !== 'normal' ||
      typeof body.visitorIpSeen !== 'boolean' ||
      typeof body.canarySeen !== 'boolean' ||
      !['geocoding', 'forecast'].every(
        (service) =>
          Number.isSafeInteger(body.calls?.[service]) &&
          body.calls[service] >= 0 &&
          body.calls[service] <= 200,
      )
    )
      throw new Error('Invalid echo report');
    if (body.visitorIpSeen || body.canarySeen) throw new Error('Echo privacy check failed');
    return { geocoding: body.calls.geocoding, forecast: body.calls.forecast };
  }
  async function request(base, urlPath, bypass, target, stage = 'sample') {
    const headers = {
      accept: 'application/json',
      'x-test-canary': canary,
      'x-forwarded-for': '198.51.100.77',
      'x-vercel-forwarded-for': '198.51.100.77',
      forwarded: 'for=198.51.100.77',
      'cf-connecting-ip': '198.51.100.77',
      ...(bypass ? { 'x-vercel-protection-bypass': bypass } : {}),
    };
    const response = await fetchResponse(stage, target, `${base}${urlPath}`, {
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    const context = { stage, target, status: response.status };
    if (
      (response.status >= 300 && response.status < 400) ||
      response.status === 401 ||
      response.status === 403
    )
      throw new ProbeFailure('Protected Preview access denied', context);
    if (response.status === 429) throw new ProbeFailure('Request rate limited', context);
    if (response.headers.get('x-nosso-clima-preview-upstream') !== 'echo-v1')
      throw new ProbeFailure('Preview fixture marker missing', context);
    const body = await responseJson(stage, target, response);
    return {
      status: response.status,
      noStore: response.headers.get('cache-control') === 'private, no-store',
      cdnMiss: response.headers.get('x-vercel-cache') === 'MISS',
      envelope:
        response.status === 200
          ? Array.isArray(body.locations) || body.daily?.length === 7
          : body.error?.code ===
            (response.status === 400 ? 'VALIDATION_ERROR' : 'SERVICE_UNAVAILABLE'),
    };
  }

  const paths = [
    { label: 'api_direct', base: api, bypass: environment.PROBE_API_BYPASS },
    { label: 'web_rewrite', base: web, bypass: environment.PROBE_WEB_BYPASS },
  ];
  const calibrationHeaders = [
    'x-forwarded-for',
    'x-vercel-forwarded-for',
    'forwarded',
    'cf-connecting-ip',
    'cf-connecting-ipv6',
    'x-real-ip',
    'true-client-ip',
  ];
  let privacyGate = 'pending_ingress_calibration';
  let calibration;
  if (ingress) {
    async function calibrate(headers) {
      return fetchResponse('calibration', 'ingress', `${ingress}/__probe/calibrate`, {
        headers: { authorization: `Bearer ${token}`, 'x-test-canary': canary, ...headers },
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
    }
    async function calibrationBody(response) {
      if (response.status !== 200)
        throw new ProbeFailure('Ingress calibration unavailable', {
          stage: 'calibration',
          target: 'ingress',
          status: response.status,
        });
      const body = await responseJson('calibration', 'ingress', response);
      if (
        body.kind !== 'nosso-clima-ingress-calibration-v1' ||
        typeof body.canaryPreserved !== 'boolean' ||
        calibrationHeaders.some((name) => typeof body.headers?.[name] !== 'boolean')
      )
        throw new Error('Invalid ingress calibration');
      if (!body.canaryPreserved) throw new Error('Ingress hides the canary');
      return body;
    }
    // Establish authenticated access before attributing a 403 to a synthetic control.
    await calibrationBody(await calibrate({}));
    calibration = { canaryPreserved: true, headers: {}, statuses: {} };
    for (const name of calibrationHeaders) {
      const value =
        name === 'forwarded'
          ? 'for=198.51.100.77'
          : name === 'cf-connecting-ipv6'
            ? '2001:db8::77'
            : '198.51.100.77';
      const response = await calibrate({ [name]: value });
      calibration.statuses[name] = response.status;
      if (response.status === 403) {
        await response.body?.cancel();
        calibration.headers[name] = false;
      } else {
        const body = await calibrationBody(response);
        calibration.headers[name] = body.headers[name];
      }
    }
    privacyGate = Object.values(calibration.statuses).includes(403)
      ? 'partial_ingress_blocks_controls'
      : calibrationHeaders.every((name) => calibration.headers[name])
        ? 'calibrated_sample_only'
        : 'partial_ingress_overwrites_headers';
  }
  // Both deployments must identify the isolated fixture before any valid query.
  await report();
  for (const target of paths) {
    const invalid = await request(
      target.base,
      '/api/v1/locations?query=a',
      target.bypass,
      target.label,
      'preflight',
    );
    if (invalid.status !== 400 && !(scenario === 'fail_closed' && invalid.status === 503))
      throw new Error('Preview preflight failed');
    if (!invalid.noStore || !invalid.envelope) throw new Error('Preview preflight failed');
  }
  const samples = [];
  for (const target of paths) {
    for (const service of ['geocoding', 'forecast']) {
      for (const profile of ['cold_then_hit', 'concurrent']) {
        const nonce = randomUUID();
        const latitude = (randomInt(-80000, 80000) / 1000).toFixed(3);
        const longitude = (randomInt(-170000, 170000) / 1000).toFixed(3);
        const urlPath =
          service === 'geocoding'
            ? `/api/v1/locations?query=P1fixture-${nonce}`
            : `/api/v1/forecast?latitude=${latitude}&longitude=${longitude}&timezone=America%2FSao_Paulo`;
        const before = await report();
        const responses =
          profile === 'concurrent'
            ? await Promise.all(
                Array.from({ length: 4 }, () =>
                  request(target.base, urlPath, target.bypass, target.label),
                ),
              )
            : [
                await request(target.base, urlPath, target.bypass, target.label),
                await request(target.base, urlPath, target.bypass, target.label),
              ];
        const after = await report();
        const outgoingCalls = after[service] - before[service];
        const otherService = service === 'geocoding' ? 'forecast' : 'geocoding';
        const expectedStatus = scenario === 'normal' ? 200 : 503;
        const ok =
          responses.every(
            (result) =>
              result.status === expectedStatus &&
              result.noStore &&
              result.cdnMiss &&
              result.envelope,
          ) &&
          outgoingCalls === (scenario === 'normal' ? 1 : 0) &&
          after[otherService] === before[otherService];
        samples.push({
          path: target.label,
          service,
          profile,
          statuses: responses.map((result) => result.status),
          outgoingCalls,
          noStore: responses.every((result) => result.noStore),
          cdnMiss: responses.every((result) => result.cdnMiss),
          ok,
        });
        if (!ok)
          return {
            ok: false,
            scenario,
            samples,
            privacy: 'no_sentinel_seen',
            privacyGate,
            calibration,
            multipleInstances: 'not_proven',
            atomicQuota: 'not_proven',
            identityTrust: 'not_proven',
          };
      }
    }
  }
  return {
    ok: true,
    scenario,
    samples,
    privacy: 'no_sentinel_seen',
    privacyGate,
    calibration,
    multipleInstances: 'not_proven',
    atomicQuota: 'not_proven',
    identityTrust: 'not_proven',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const summary = await runPreviewProbe(process.env);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    if (!summary.ok) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(formatProbeFailure(error));
    process.exitCode = 1;
  }
}
