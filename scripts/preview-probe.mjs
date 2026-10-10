import { randomUUID, randomInt } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function origin(value, loopback = false) {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    (url.protocol !== 'https:' &&
      !(loopback && url.protocol === 'http:' && url.hostname === '127.0.0.1'))
  ) {
    throw new Error('Invalid probe configuration');
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
    if (
      environment.PROBE_CONFIRM_PREVIEW !== 'isolated-fixtures' ||
      !['normal', 'fail_closed'].includes(scenario) ||
      !/^[\w-]{32,256}$/.test(token ?? '') ||
      !/^[\w-]{8,100}$/.test(canary ?? '')
    )
      throw new Error('Invalid configuration');
    api = origin(environment.PROBE_API_ORIGIN);
    web = origin(environment.PROBE_WEB_ORIGIN);
    echo = origin(environment.PROBE_REPORT_ORIGIN, true);
    if (environment.PROBE_INGRESS_ORIGIN) ingress = origin(environment.PROBE_INGRESS_ORIGIN);
    if (api === web || echo === api || echo === web) throw new Error('Invalid configuration');
  } catch {
    throw new Error('Invalid probe configuration');
  }

  async function report() {
    const response = await fetchImpl(`${echo}/__probe/report`, {
      headers: { authorization: `Bearer ${token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (response.status !== 200) throw new Error('Echo report unavailable');
    const body = await readJson(response);
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
  async function request(base, urlPath, bypass) {
    const headers = {
      accept: 'application/json',
      'x-test-canary': canary,
      'x-forwarded-for': '198.51.100.77',
      'x-vercel-forwarded-for': '198.51.100.77',
      forwarded: 'for=198.51.100.77',
      'cf-connecting-ip': '198.51.100.77',
      ...(bypass ? { 'x-vercel-protection-bypass': bypass } : {}),
    };
    const response = await fetchImpl(`${base}${urlPath}`, {
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (response.headers.get('x-nosso-clima-preview-upstream') !== 'echo-v1')
      throw new Error('Preview fixture marker missing');
    const body = await readJson(response);
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
    const response = await fetchImpl(`${ingress}/__probe/calibrate`, {
      headers: {
        authorization: `Bearer ${token}`,
        'x-test-canary': canary,
        ...Object.fromEntries(calibrationHeaders.map((name) => [name, '198.51.100.77'])),
      },
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (response.status !== 200) throw new Error('Ingress calibration unavailable');
    const body = await readJson(response);
    if (
      body.kind !== 'nosso-clima-ingress-calibration-v1' ||
      typeof body.canaryPreserved !== 'boolean' ||
      calibrationHeaders.some((name) => typeof body.headers?.[name] !== 'boolean')
    )
      throw new Error('Invalid ingress calibration');
    calibration = {
      canaryPreserved: body.canaryPreserved,
      headers: Object.fromEntries(calibrationHeaders.map((name) => [name, body.headers[name]])),
    };
    if (!calibration.canaryPreserved) throw new Error('Ingress hides the canary');
    privacyGate = calibrationHeaders.every((name) => calibration.headers[name])
      ? 'calibrated_sample_only'
      : 'partial_ingress_overwrites_headers';
  }
  // Both deployments must identify the isolated fixture before any valid query.
  await report();
  for (const target of paths) {
    const invalid = await request(target.base, '/api/v1/locations?query=a', target.bypass);
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
                Array.from({ length: 4 }, () => request(target.base, urlPath, target.bypass)),
              )
            : [
                await request(target.base, urlPath, target.bypass),
                await request(target.base, urlPath, target.bypass),
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
  } catch {
    process.stderr.write(
      'Preview probe interrupted: check fixture marker, protected access, echo and configuration. No operational values were printed.\n',
    );
    process.exitCode = 1;
  }
}
