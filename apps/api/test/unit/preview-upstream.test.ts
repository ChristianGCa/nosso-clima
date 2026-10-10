import { describe, expect, it, vi } from 'vitest';

import { createPreviewUpstream } from '../../src/infrastructure/preview-upstream.js';
import { createReservedOpenMeteoFetch } from '../../src/infrastructure/reserved-open-meteo-fetch.js';

const preview = {
  VERCEL_ENV: 'preview',
  UPSTREAM_TEST_BASE: 'https://echo.example.test',
  UPSTREAM_TEST_TOKEN: 'fixture-only-'.repeat(4),
};

describe('isolated Preview upstream', () => {
  it('keeps the default transport when no test configuration exists', () => {
    const fetchImpl = vi.fn<typeof fetch>();
    expect(createPreviewUpstream({}, fetchImpl)).toBe(fetchImpl);
  });

  it.each(['production', 'development', undefined])(
    'rejects test settings in %s',
    (environment) => {
      expect(() => createPreviewUpstream({ ...preview, VERCEL_ENV: environment })).toThrow(
        'Invalid Preview upstream configuration',
      );
    },
  );

  it.each([
    { UPSTREAM_TEST_BASE: undefined },
    { UPSTREAM_TEST_BASE: '' },
    { UPSTREAM_TEST_TOKEN: undefined },
    { UPSTREAM_TEST_TOKEN: '' },
    { UPSTREAM_TEST_TOKEN: 'short' },
    { UPSTREAM_TEST_TOKEN: 'fixture with spaces'.repeat(4) },
    { UPSTREAM_TEST_BASE: 'http://echo.example.test' },
    { UPSTREAM_TEST_BASE: 'https://localhost' },
    { UPSTREAM_TEST_BASE: 'https://127.0.0.1' },
    { UPSTREAM_TEST_BASE: 'https://[::1]' },
    { UPSTREAM_TEST_BASE: 'https://echo.localhost.' },
    { UPSTREAM_TEST_BASE: 'https://echo.example.test:8443' },
    { UPSTREAM_TEST_BASE: 'https://user:pass@echo.example.test' },
    { UPSTREAM_TEST_BASE: 'https://echo.example.test/path' },
    { UPSTREAM_TEST_BASE: 'https://api.open-meteo.com' },
    { UPSTREAM_TEST_BASE: 'https://geocoding-api.open-meteo.com' },
    { UPSTREAM_TEST_BASE: 'https://echo.example.test/?private=value' },
    { UPSTREAM_TEST_BASE: 'https://echo.example.test/#fragment' },
    { UPSTREAM_TEST_BASE: ' https://echo.example.test' },
    { UPSTREAM_TEST_BASE: 'not a URL' },
  ])('rejects incomplete or unsafe configuration %#', (values) => {
    expect(() => createPreviewUpstream({ ...preview, ...values })).toThrow(
      /^Invalid Preview upstream configuration$/,
    );
  });

  it.each([
    'https://geocoding-api.open-meteo.com/v1/search?name=Fixture',
    'https://api.open-meteo.com/v1/forecast?latitude=1&timezone=America%2FSao_Paulo',
  ])('maps a validated provider destination after reservation: %s', async (url) => {
    const order: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      order.push('fetch');
      return new Response('{}');
    });
    const circuit = {
      check: async () => ({ kind: 'normal' as const }),
      trip: vi.fn(),
      resolveProbe: vi.fn(),
    };
    const transport = createReservedOpenMeteoFetch({
      quota: {
        reserve: async () => {
          order.push('reserve');
          return true;
        },
      },
      circuits: { geocoding: circuit, forecast: circuit },
      costs: { geocoding: 1000, forecast: 1000 },
      fetchImpl: createPreviewUpstream(preview, fetchImpl),
    });
    const signal = new AbortController().signal;
    await transport(new URL(url), { redirect: 'error', signal });

    const original = new URL(url);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      `https://echo.example.test${original.pathname}${original.search}`,
    );
    expect(fetchImpl.mock.calls[0]?.[1]).toEqual({
      method: 'GET',
      redirect: 'error',
      signal,
      headers: { authorization: `Bearer ${preview.UPSTREAM_TEST_TOKEN}` },
    });
    expect(order).toEqual(['reserve', 'fetch']);
  });

  it('cannot turn a denied reservation into an echo call', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const circuit = {
      check: async () => ({ kind: 'normal' as const }),
      trip: vi.fn(),
      resolveProbe: vi.fn(),
    };
    const transport = createReservedOpenMeteoFetch({
      quota: { reserve: async () => false },
      circuits: { geocoding: circuit, forecast: circuit },
      costs: { geocoding: 1000, forecast: 1000 },
      fetchImpl: createPreviewUpstream(preview, fetchImpl),
    });
    await expect(
      transport(new URL('https://api.open-meteo.com/v1/forecast'), { redirect: 'error' }),
    ).rejects.toMatchObject({ kind: 'quota_denied' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses unexpected destinations and visitor headers before authentication is sent', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const transport = createPreviewUpstream(preview, fetchImpl);
    await expect(
      transport(new URL('https://other.example.test/v1/search'), { redirect: 'error' }),
    ).rejects.toThrow();
    await expect(
      transport(new URL('https://api.open-meteo.com/v1/forecast'), {
        redirect: 'error',
        headers: { 'x-test-canary': 'visitor' },
      }),
    ).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
