import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatProbeFailure, runPreviewProbe } from './preview-probe.mjs';

const settings = {
  PROBE_CONFIRM_PREVIEW: 'isolated-fixtures',
  PROBE_API_ORIGIN: 'https://api.example.test',
  PROBE_WEB_ORIGIN: 'https://web.example.test',
  PROBE_REPORT_ORIGIN: 'http://127.0.0.1:8787',
  UPSTREAM_TEST_TOKEN: 'fixture-only-'.repeat(4),
  PROBE_CANARY: 'fixture-canary',
};

function fixture({ marker = true, deny = false, leak = false, overwrite = false } = {}) {
  const calls = { geocoding: 0, forecast: 0 };
  const seen = new Set();
  const requests = [];
  async function fetchImpl(input, init) {
    const url = new URL(input);
    requests.push({ url, init });
    if (
      url.pathname === '/' &&
      new Headers(init.headers).get('x-vercel-set-bypass-cookie') === 'true'
    )
      return new Response(null, {
        status: 307,
        headers: { 'set-cookie': '_vercel_jwt=fixture-cookie; Path=/; Secure; HttpOnly' },
      });
    if (url.pathname === '/__probe/calibrate')
      return Response.json({
        kind: 'nosso-clima-ingress-calibration-v1',
        canaryPreserved: true,
        headers: Object.fromEntries(
          [
            'x-forwarded-for',
            'x-vercel-forwarded-for',
            'forwarded',
            'cf-connecting-ip',
            'cf-connecting-ipv6',
            'x-real-ip',
            'true-client-ip',
          ].map((name) => [name, !(overwrite && name === 'cf-connecting-ip')]),
        ),
      });
    if (url.pathname === '/__probe/report')
      return Response.json({
        kind: 'nosso-clima-preview-echo-v1',
        mode: 'normal',
        calls: { ...calls },
        visitorIpSeen: leak,
        canarySeen: false,
      });
    const headers = {
      'cache-control': 'private, no-store',
      'x-vercel-cache': 'MISS',
      ...(marker ? { 'x-nosso-clima-preview-upstream': 'echo-v1' } : {}),
    };
    if (url.searchParams.get('query') === 'a')
      return Response.json({ error: { code: 'VALIDATION_ERROR' } }, { status: 400, headers });
    if (deny)
      return Response.json({ error: { code: 'SERVICE_UNAVAILABLE' } }, { status: 503, headers });
    const service = url.pathname.endsWith('locations') ? 'geocoding' : 'forecast';
    if (!seen.has(url.href)) {
      seen.add(url.href);
      calls[service] += 1;
    }
    return Response.json(
      service === 'geocoding' ? { locations: [] } : { daily: Array(7).fill({}) },
      { headers },
    );
  }
  return { fetchImpl, calls, requests };
}

test('probe checks both paths, counts cold calls, hits and concurrent misses without printing infrastructure', async () => {
  const fake = fixture();
  const summary = await runPreviewProbe(settings, fake.fetchImpl);
  assert.equal(summary.ok, true);
  assert.equal(summary.samples.length, 8);
  assert.equal(fake.calls.geocoding, 4);
  assert.equal(fake.calls.forecast, 4);
  assert.doesNotMatch(
    JSON.stringify(summary),
    /example\.test|127\.0\.0\.1|fixture-canary|Bearer|latitude|query=/,
  );
});

test('probe refuses unmarked deployments before any valid provider query', async () => {
  const fake = fixture({ marker: false });
  await assert.rejects(
    runPreviewProbe(settings, fake.fetchImpl),
    /^Error: Preview fixture marker missing$/,
  );
  assert.deepEqual(fake.calls, { geocoding: 0, forecast: 0 });
});

test('fail-closed profile requires 503 and zero calls received by echo', async () => {
  const fake = fixture({ deny: true });
  const summary = await runPreviewProbe(
    { ...settings, PROBE_SCENARIO: 'fail_closed' },
    fake.fetchImpl,
  );
  assert.equal(summary.ok, true);
  assert.deepEqual(fake.calls, { geocoding: 0, forecast: 0 });
});

test('probe blocks a receiver that has already detected a privacy leak', async () => {
  const fake = fixture({ leak: true });
  await assert.rejects(
    runPreviewProbe(settings, fake.fetchImpl),
    /^Error: Echo privacy check failed$/,
  );
  assert.deepEqual(fake.calls, { geocoding: 0, forecast: 0 });
});

test('web cookie authorizes the web and the forwarded API token authorizes its rewrite without reaching echo', async () => {
  const fake = fixture();
  await runPreviewProbe(
    { ...settings, PROBE_API_BYPASS: 'api-fixture', PROBE_WEB_BYPASS: 'web-fixture' },
    fake.fetchImpl,
  );
  for (const request of fake.requests) {
    const headers = new Headers(request.init.headers);
    if (request.url.hostname === '127.0.0.1') {
      assert.equal(headers.get('x-vercel-protection-bypass'), null);
      assert.equal(headers.get('cookie'), null);
    } else if (request.url.pathname === '/') {
      assert.equal(headers.get('x-vercel-protection-bypass'), 'web-fixture');
      assert.equal(request.init.redirect, 'manual');
      continue;
    } else {
      assert.equal(headers.get('x-vercel-protection-bypass'), 'api-fixture');
      assert.equal(
        headers.get('cookie'),
        request.url.hostname.startsWith('web.') ? '_vercel_jwt=fixture-cookie' : null,
      );
    }
    assert.equal(request.init.redirect, 'error');
  }
});

test('failed web cookie bootstrap stops before valid fixture queries', async () => {
  const fake = fixture();
  const fetchImpl = async (input, init) =>
    new URL(input).pathname === '/'
      ? new Response('denied', { status: 401 })
      : fake.fetchImpl(input, init);
  let failure;
  try {
    await runPreviewProbe(
      { ...settings, PROBE_API_BYPASS: 'api-fixture', PROBE_WEB_BYPASS: 'web-fixture' },
      fetchImpl,
    );
  } catch (error) {
    failure = error;
  }
  assert.match(formatProbeFailure(failure), /web_cookie_unavailable/);
  assert.match(formatProbeFailure(failure), /HTTP=401/);
  assert.deepEqual(fake.calls, { geocoding: 0, forecast: 0 });
});

test('probe refuses unsafe origins and missing explicit confirmation', async () => {
  for (const values of [
    { PROBE_CONFIRM_PREVIEW: undefined },
    { PROBE_API_ORIGIN: 'http://api.example.test' },
    { PROBE_REPORT_ORIGIN: 'http://echo.example.test' },
    { PROBE_SCENARIO: 'unknown' },
    { PROBE_WEB_ORIGIN: 'https://user:pass@web.example.test' },
  ]) {
    await assert.rejects(
      runPreviewProbe({ ...settings, ...values }),
      /^Error: Invalid probe configuration$/,
    );
  }
});

test('ingress that overwrites IP headers cannot produce a complete privacy verdict', async () => {
  const fake = fixture({ overwrite: true });
  const summary = await runPreviewProbe(
    { ...settings, PROBE_INGRESS_ORIGIN: 'https://echo.example.test' },
    fake.fetchImpl,
  );
  assert.equal(summary.ok, true);
  assert.equal(summary.privacyGate, 'partial_ingress_overwrites_headers');
  assert.equal(summary.calibration.headers['cf-connecting-ip'], false);
  assert.equal(summary.atomicQuota, 'not_proven');
  assert.equal(summary.identityTrust, 'not_proven');
});

test('ingress rejection of a single calibration header remains explicit and does not suppress other controls', async () => {
  const fake = fixture();
  const fetchImpl = async (input, init) => {
    if (
      new URL(input).pathname === '/__probe/calibrate' &&
      new Headers(init.headers).has('cf-connecting-ip')
    )
      return new Response('proxy rejection', { status: 403 });
    return fake.fetchImpl(input, init);
  };
  const summary = await runPreviewProbe(
    { ...settings, PROBE_INGRESS_ORIGIN: 'https://echo.example.test' },
    fetchImpl,
  );
  assert.equal(summary.ok, true);
  assert.equal(summary.privacyGate, 'partial_ingress_blocks_controls');
  assert.equal(summary.calibration.statuses['cf-connecting-ip'], 403);
  assert.equal(summary.calibration.headers['cf-connecting-ip'], false);
  assert.equal(summary.calibration.headers['x-forwarded-for'], true);
  assert.equal(summary.calibration.statuses['x-forwarded-for'], 200);
});

test('a blocked baseline calibration cannot be accepted as a blocked individual header', async () => {
  const fake = fixture();
  const fetchImpl = async (input, init) =>
    new URL(input).pathname === '/__probe/calibrate'
      ? new Response('denied', { status: 403 })
      : fake.fetchImpl(input, init);
  await assert.rejects(
    runPreviewProbe({ ...settings, PROBE_INGRESS_ORIGIN: 'https://echo.example.test' }, fetchImpl),
    /Ingress calibration unavailable/,
  );
  assert.deepEqual(fake.calls, { geocoding: 0, forecast: 0 });
});

test('diagnostic identifies a missing configuration field without revealing values', async () => {
  let failure;
  try {
    await runPreviewProbe({ ...settings, PROBE_API_ORIGIN: undefined });
  } catch (error) {
    failure = error;
  }
  assert.match(formatProbeFailure(failure), /PROBE_API_ORIGIN/);
  assert.doesNotMatch(formatProbeFailure(failure), /example\.test|fixture-only|Bearer/);
});

test('diagnostic distinguishes protected access from a missing fixture marker', async () => {
  const fake = fixture();
  const fetchImpl = async (input, init) =>
    String(input).includes('/api/v1/')
      ? new Response('private upstream body', {
          status: 302,
          headers: { location: 'https://private.example.test/auth' },
        })
      : fake.fetchImpl(input, init);
  let failure;
  try {
    await runPreviewProbe(settings, fetchImpl);
  } catch (error) {
    failure = error;
  }
  const diagnostic = formatProbeFailure(failure);
  assert.match(diagnostic, /protected_access/);
  assert.match(diagnostic, /api_direct/);
  assert.match(diagnostic, /302/);
  assert.doesNotMatch(diagnostic, /private|example\.test|fixture-only|Bearer/);
  assert.deepEqual(fake.calls, { geocoding: 0, forecast: 0 });
});

test('unknown errors cannot inject operational values into diagnostics', () => {
  const diagnostic = formatProbeFailure(
    new Error('https://private.example.test?token=private-value'),
  );
  assert.match(diagnostic, /unexpected_failure/);
  assert.doesNotMatch(diagnostic, /private|token=|https:/);
});
