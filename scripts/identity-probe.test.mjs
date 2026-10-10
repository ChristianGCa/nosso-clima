import assert from 'node:assert/strict';
import { test } from 'node:test';

import { runIdentityProbe } from './identity-probe.mjs';

const settings = {
  IDENTITY_PROBE_CONFIRM: 'protected-preview',
  PROBE_API_ORIGIN: 'https://api.example.test',
  PROBE_WEB_ORIGIN: 'https://web.example.test',
  PROBE_API_BYPASS: 'api-fixture',
  PROBE_WEB_BYPASS: 'web-fixture',
};

function fixture({ spoofable = false, earlyWaf = false } = {}) {
  const requests = [];
  const counts = new Map();
  async function fetchImpl(input, init) {
    const url = new URL(input);
    const headers = new Headers(init.headers);
    if (url.pathname === '/') {
      return new Response(null, {
        status: 307,
        headers: { 'set-cookie': '_vercel_jwt=fixture-cookie; Path=/; Secure; HttpOnly' },
      });
    }
    requests.push({ url, headers });
    if (earlyWaf) return new Response('<html>WAF</html>', { status: 429 });
    const group = url.pathname.endsWith('locations') ? 'locations' : 'forecast';
    const visitor = spoofable ? headers.get('x-vercel-forwarded-for') : 'actual-visitor';
    const key = `${group}:${visitor}`;
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    const limited = count > (group === 'locations' ? 30 : 15);
    return Response.json(
      { error: { code: limited ? 'RATE_LIMITED' : 'VALIDATION_ERROR' } },
      { status: limited ? 429 : 400, headers: { 'cache-control': 'private, no-store' } },
    );
  }
  return { requests, fetchImpl };
}

test('isolated probe finds a stable identity on each path despite changing forged headers', async () => {
  const fake = fixture();
  const result = await runIdentityProbe(settings, fake.fetchImpl, () => 120_000);
  assert.deepEqual(result, { ok: true, apiDirect: 'rate_limited', webRewrite: 'rate_limited' });
  assert.equal(fake.requests.length, 47);
  assert.equal(
    new Set(fake.requests.map((request) => request.headers.get('x-vercel-forwarded-for'))).size,
    47,
  );
  assert.equal(
    fake.requests.filter((request) => request.url.hostname === 'api.example.test').length,
    31,
  );
  assert.equal(
    fake.requests.filter((request) => request.url.hostname === 'web.example.test').length,
    16,
  );
  assert.ok(
    fake.requests
      .filter((request) => request.url.hostname === 'api.example.test')
      .every((request) => !request.headers.has('cookie')),
  );
  assert.ok(
    fake.requests
      .filter((request) => request.url.hostname === 'web.example.test')
      .every((request) => request.headers.has('cookie')),
  );
  assert.ok(
    fake.requests.every(
      (request) =>
        !request.url.searchParams.has('query') || request.url.searchParams.get('query') === 'a',
    ),
  );
  assert.doesNotMatch(JSON.stringify(result), /example\.test|fixture|198\.51\.100/);
});

test('probe reports a spoofable identity as unproven', async () => {
  const fake = fixture({ spoofable: true });
  const result = await runIdentityProbe(settings, fake.fetchImpl, () => 120_000);
  assert.deepEqual(result, { ok: false, apiDirect: 'no_app_limit', webRewrite: 'not_run' });
  assert.equal(fake.requests.length, 31);
});

test('probe stops on WAF responses and unsafe configuration without claiming identity trust', async () => {
  const blocked = fixture({ earlyWaf: true });
  assert.deepEqual(await runIdentityProbe(settings, blocked.fetchImpl, () => 120_000), {
    ok: false,
    apiDirect: 'inconclusive',
    webRewrite: 'not_run',
  });
  assert.equal(blocked.requests.length, 1);

  const unused = fixture();
  await assert.rejects(
    runIdentityProbe(
      { ...settings, PROBE_API_ORIGIN: 'http://api.example.test' },
      unused.fetchImpl,
    ),
    /Invalid identity probe configuration/,
  );
  assert.equal(unused.requests.length, 0);
});

test('probe is inconclusive when requests cross a minute boundary', async () => {
  const fake = fixture();
  let reads = 0;
  const result = await runIdentityProbe(settings, fake.fetchImpl, () => {
    reads += 1;
    return reads < 5 ? 120_000 : 180_000;
  });
  assert.deepEqual(result, { ok: false, apiDirect: 'inconclusive', webRewrite: 'not_run' });
  assert.ok(fake.requests.length < 31);
});
