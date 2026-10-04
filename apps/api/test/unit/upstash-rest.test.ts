import { describe, expect, it } from 'vitest';

import {
  createUpstashRestClient,
  UpstashUnavailable,
} from '../../src/infrastructure/upstash-rest.js';

const endpoint = 'https://test-redis.upstash.io';
const token = 'test-token-not-a-real-credential';

describe('Upstash REST EVAL transport', () => {
  it('sends one authenticated JSON command to the configured HTTPS root', async () => {
    let request: { input: Parameters<typeof fetch>[0]; init: RequestInit | undefined } | undefined;
    const fetchImpl: typeof fetch = async (input, init) => {
      request = { input, init };
      return new Response(JSON.stringify({ result: 1 }), {
        headers: { 'content-type': 'application/json' },
      });
    };
    const client = createUpstashRestClient({ endpoint, token, fetchImpl });

    await expect(client.eval('return 1', ['quota:{all}:v1'], ['2'])).resolves.toBe(1);
    expect(String(request?.input)).toBe(`${endpoint}/`);
    expect(request?.init?.method).toBe('POST');
    expect(request?.init?.redirect).toBe('error');
    expect(new Headers(request?.init?.headers).get('authorization')).toBe(`Bearer ${token}`);
    expect(new Headers(request?.init?.headers).get('content-type')).toBe('application/json');
    expect(JSON.parse(String(request?.init?.body))).toEqual([
      'EVAL',
      'return 1',
      1,
      'quota:{all}:v1',
      '2',
    ]);
    expect(request?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    [
      'Redis error',
      new Response(JSON.stringify({ error: 'private Redis detail' }), { status: 200 }),
    ],
    ['unauthorized', new Response('private token detail', { status: 401 })],
    ['invalid JSON', new Response('{', { status: 200 })],
    ['missing result', new Response(JSON.stringify({ ok: true }), { status: 200 })],
    ['oversize response', new Response('x'.repeat(8193), { status: 200 })],
  ])('fails closed on %s without leaking response data', async (_case, response) => {
    const client = createUpstashRestClient({ endpoint, token, fetchImpl: async () => response });
    await expect(client.eval('return 1', [], [])).rejects.toEqual(new UpstashUnavailable());
  });

  it('rejects unsafe transport settings and hides network errors', async () => {
    expect(() =>
      createUpstashRestClient({ endpoint: 'http://test-redis.upstash.io', token }),
    ).toThrow(/^Invalid Upstash transport configuration$/);
    const client = createUpstashRestClient({
      endpoint,
      token,
      fetchImpl: async () => {
        throw new Error('private network detail');
      },
    });
    await expect(client.eval('return 1', [], [])).rejects.toEqual(new UpstashUnavailable());
  });
});
