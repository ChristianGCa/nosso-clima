import assert from 'node:assert/strict';
import { test } from 'node:test';

import { runPreviewProbe } from './preview-probe.mjs';

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

test('deployment bypass stays scoped to its project and never reaches echo', async () => {
  const fake = fixture();
  await runPreviewProbe(
    { ...settings, PROBE_API_BYPASS: 'api-fixture', PROBE_WEB_BYPASS: 'web-fixture' },
    fake.fetchImpl,
  );
  for (const request of fake.requests) {
    const headers = new Headers(request.init.headers);
    if (request.url.hostname === '127.0.0.1')
      assert.equal(headers.get('x-vercel-protection-bypass'), null);
    else
      assert.equal(
        headers.get('x-vercel-protection-bypass'),
        request.url.hostname.startsWith('api.') ? 'api-fixture' : 'web-fixture',
      );
    assert.equal(request.init.redirect, 'error');
  }
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
