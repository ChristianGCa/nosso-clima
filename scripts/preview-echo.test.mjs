import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';

import { createEchoHandler } from './preview-echo.mjs';

const token = 'fixture-only-'.repeat(4);

test('protected echo observes real HTTP without exposing visitor values', async (t) => {
  const handler = createEchoHandler({
    token,
    visitorIps: ['203.0.113.10', '2001:db8::a'],
    canary: 'fixture-canary',
  });
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { authorization: `Bearer ${token}` };
  async function report() {
    return (await fetch(`${base}/__probe/report`, { headers })).json();
  }

  await t.test('rejects unauthorized requests and returns no cached diagnostics', async () => {
    const response = await fetch(`${base}/__probe/report`);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal((await report()).calls.geocoding, 0);
  });
  await t.test('returns provider-compatible fixtures and counts both routes', async () => {
    const search = await fetch(`${base}/v1/search?name=fixture`, { headers });
    const forecast = await fetch(`${base}/v1/forecast?timezone=America%2FSao_Paulo`, { headers });
    assert.equal(search.status, 200);
    assert.ok(Array.isArray((await search.json()).results));
    const body = await forecast.json();
    assert.equal(body.daily.time.length, 7);
    assert.equal(body.hourly.time.length, 168);
    assert.deepEqual((await report()).calls, { geocoding: 1, forecast: 1 });
  });
  await t.test(
    'calibration reports only preserved sentinels and never enters the sample counts',
    async () => {
      const before = await report();
      const response = await fetch(`${base}/__probe/calibrate`, {
        headers: {
          ...headers,
          'x-test-canary': 'fixture-canary',
          'x-forwarded-for': '198.51.100.77',
        },
      });
      const body = await response.json();
      assert.equal(body.canaryPreserved, true);
      assert.equal(body.headers['x-forwarded-for'], true);
      assert.equal(body.headers['cf-connecting-ip'], false);
      const ipv6 = await fetch(`${base}/__probe/calibrate`, {
        headers: {
          ...headers,
          'x-test-canary': 'fixture-canary',
          'cf-connecting-ipv6': '2001:db8::77',
        },
      });
      assert.equal((await ipv6.json()).headers['cf-connecting-ipv6'], true);
      assert.deepEqual(await report(), before);
      assert.doesNotMatch(JSON.stringify(body), /198\.51\.100\.77|fixture-canary|Bearer/);
    },
  );
  await t.test('detects IPv4, equivalent IPv6 and canary, but emits only booleans', async () => {
    await fetch(`${base}/v1/search?name=fixture`, {
      headers: {
        ...headers,
        forwarded: 'for="[2001:0db8:0:0:0:0:0:a]"',
        'x-test-canary': 'fixture-canary',
      },
    });
    await fetch(`${base}/v1/forecast`, {
      headers: { ...headers, 'x-forwarded-for': '203.0.113.10' },
    });
    const observed = await report();
    assert.equal(observed.visitorIpSeen, true);
    assert.equal(observed.canarySeen, true);
    assert.doesNotMatch(JSON.stringify(observed), /203\.0\.113\.10|2001:|fixture-canary|Bearer/);
  });
  await t.test('authenticated controls simulate 429 and oversized bodies', async () => {
    async function configure(mode) {
      return fetch(`${base}/__probe/config`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
    }
    assert.equal((await configure('rate_limited')).status, 200);
    assert.equal((await fetch(`${base}/v1/search`, { headers })).status, 429);
    assert.equal((await configure('oversized')).status, 200);
    assert.ok(
      (await (await fetch(`${base}/v1/forecast`, { headers })).arrayBuffer()).byteLength > 65536,
    );
    assert.equal((await configure('unknown')).status, 400);
    assert.equal((await fetch(`${base}/v1/forecast`, { method: 'POST', headers })).status, 405);
  });
});

test('echo detects IPv4-mapped IPv6 without retaining raw addresses', async () => {
  const handler = createEchoHandler({
    token,
    visitorIps: ['203.0.113.10'],
    canary: 'fixture-canary',
  });
  let output;
  const response = {
    writeHead() {},
    end(value) {
      output = JSON.parse(value);
    },
  };
  handler(
    {
      method: 'GET',
      url: '/v1/search',
      headers: { authorization: `Bearer ${token}` },
      rawHeaders: ['Forwarded', 'for="[::ffff:203.0.113.10]"'],
    },
    response,
  );
  await new Promise((resolve) => setImmediate(resolve));
  handler(
    { method: 'GET', url: '/__probe/report', headers: { authorization: `Bearer ${token}` } },
    response,
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(output.visitorIpSeen, true);
  assert.doesNotMatch(JSON.stringify(output), /203\.0\.113\.10|::ffff/);
});

test('echo requires valid, explicit visitor sentinels and credentials', () => {
  for (const values of [
    { token: 'short' },
    { visitorIps: [] },
    { visitorIps: ['invalid'] },
    { canary: '' },
  ]) {
    assert.throws(
      () =>
        createEchoHandler({
          token,
          visitorIps: ['203.0.113.10'],
          canary: 'fixture-canary',
          ...values,
        }),
      /Invalid echo configuration/,
    );
  }
});
