import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createVercelApp } from '../../src/vercel-app.js';
import { RESERVE_QUOTA_SCRIPT } from '../../src/infrastructure/quota-reservation.js';
import {
  ACQUIRE_CACHE_LOCK_SCRIPT,
  READ_CACHE_SCRIPT,
  RELEASE_CACHE_LOCK_SCRIPT,
  WRITE_CACHE_SCRIPT,
} from '../../src/infrastructure/redis-cache.js';
import { SHARED_VISITOR_LIMIT_SCRIPT } from '../../src/infrastructure/shared-visitor-limit.js';
import {
  CHECK_CIRCUIT_SCRIPT,
  TRIP_CIRCUIT_SCRIPT,
} from '../../src/infrastructure/upstream-circuit.js';
import {
  UpstashUnavailable,
  type UpstashRestClient,
} from '../../src/infrastructure/upstash-rest.js';
import { forecastWithHourly } from '../fixtures/forecast-with-hourly.js';

const productionEnvironment = {
  NODE_ENV: 'production',
  HOST: '0.0.0.0',
  LOG_LEVEL: 'silent',
  CORS_ALLOWED_ORIGINS: 'https://clima.example.com',
  UPSTASH_REDIS_REST_URL: 'https://test-redis.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'test-token-not-a-real-credential',
  RATE_LIMIT_HMAC_KEY: 'ab'.repeat(32),
  CACHE_HMAC_KEY: 'cd'.repeat(32),
  OPEN_METEO_MINUTE_CREDITS: '10000',
  OPEN_METEO_HOUR_CREDITS: '50000',
  OPEN_METEO_DAY_CREDITS: '100000',
  OPEN_METEO_MONTH_CREDITS: '200000',
  OPEN_METEO_GEOCODING_CREDITS: '1000',
  OPEN_METEO_FORECAST_CREDITS: '2000',
  OPEN_METEO_429_COOLDOWN_MS: '60000',
  OPEN_METEO_PROBE_MS: '10000',
} as const;
const visitorHeaders = { 'x-vercel-forwarded-for': '203.0.113.10' };

function withAllowedVisitorLimit(redis: UpstashRestClient): UpstashRestClient {
  const cache = new Map<string, string>();
  const locks = new Map<string, string>();
  return {
    eval(script, keys, args) {
      if (script === SHARED_VISITOR_LIMIT_SCRIPT) return Promise.resolve([1, 60_000, 59]);
      const key = keys[0];
      if (key && script === READ_CACHE_SCRIPT) return Promise.resolve(cache.get(key) ?? null);
      if (key && script === WRITE_CACHE_SCRIPT) {
        cache.set(key, args[0] ?? '');
        return Promise.resolve('OK');
      }
      if (key && script === ACQUIRE_CACHE_LOCK_SCRIPT) {
        if (locks.has(key)) return Promise.resolve(0);
        locks.set(key, args[0] ?? '');
        return Promise.resolve(1);
      }
      if (key && script === RELEASE_CACHE_LOCK_SCRIPT) {
        if (locks.get(key) !== args[0]) return Promise.resolve(0);
        locks.delete(key);
        return Promise.resolve(1);
      }
      return redis.eval(script, keys, args);
    },
  };
}

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('Vercel Fastify entry', () => {
  it('routes both Preview providers to the echo without visitor headers', async () => {
    const redis: UpstashRestClient = { eval: async () => 1 };
    const providerFetch = vi.fn<typeof fetch>(async (input) =>
      Response.json(String(input).includes('/v1/search') ? { results: [] } : forecastWithHourly),
    );
    app = createVercelApp(
      {
        ...productionEnvironment,
        VERCEL_ENV: 'preview',
        UPSTREAM_TEST_BASE: 'https://echo.example.test',
        UPSTREAM_TEST_TOKEN: 'fixture-only-'.repeat(4),
      },
      { redis: withAllowedVisitorLimit(redis), providerFetch },
    );
    for (const url of [
      '/api/v1/locations?query=Fixture',
      '/api/v1/forecast?latitude=-23.548&longitude=-46.636&timezone=America%2FSao_Paulo',
    ]) {
      const response = await app.inject({
        method: 'GET',
        url,
        headers: {
          ...visitorHeaders,
          'x-test-canary': 'visitor-canary',
          cookie: 'visitor-cookie',
          forwarded: 'for=203.0.113.10',
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers['x-nosso-clima-preview-upstream']).toBe('echo-v1');
    }
    expect(providerFetch).toHaveBeenCalledTimes(2);
    for (const [input, init] of providerFetch.mock.calls) {
      expect(new URL(String(input)).origin).toBe('https://echo.example.test');
      expect([...new Headers(init?.headers).keys()]).toEqual(['authorization']);
      expect(JSON.stringify(init)).not.toMatch(/visitor-canary|visitor-cookie|203\.0\.113\.10/);
    }
  });
  it('marks the isolated Preview and rejects test settings in Production', async () => {
    const settings = {
      UPSTREAM_TEST_BASE: 'https://echo.example.test',
      UPSTREAM_TEST_TOKEN: 'fixture-only-'.repeat(4),
    };
    expect(() =>
      createVercelApp({ ...productionEnvironment, ...settings, VERCEL_ENV: 'production' }),
    ).toThrow(/^Invalid API configuration$/);
    app = createVercelApp({ ...productionEnvironment, ...settings, VERCEL_ENV: 'preview' });
    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.headers['x-nosso-clima-preview-upstream']).toBe('echo-v1');
    expect(health.json()).toEqual({ status: 'ok' });
  });
  it('starts Preview without process-only settings or an explicit provisional provider policy', async () => {
    const previewEnvironment = Object.fromEntries(
      Object.entries(productionEnvironment).filter(
        ([key]) => key !== 'NODE_ENV' && key !== 'HOST' && !key.startsWith('OPEN_METEO_'),
      ),
    );
    app = createVercelApp({ ...previewEnvironment, VERCEL_ENV: 'preview' });

    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: 'ok' });
  });

  it('rejects a development runtime on Preview', () => {
    expect(() =>
      createVercelApp({ ...productionEnvironment, VERCEL_ENV: 'preview', NODE_ENV: 'development' }),
    ).toThrow(/^Invalid API configuration$/);
  });

  it.each([
    ['application_environment', { CORS_ALLOWED_ORIGINS: 'sensitive-invalid-origin' }],
    ['UPSTASH_REDIS_REST_URL', { UPSTASH_REDIS_REST_URL: 'sensitive-invalid-url' }],
    ['provider_policy', { OPEN_METEO_MONTH_CREDITS: 'sensitive-invalid-credits' }],
  ])('logs only a safe configuration failure code for %s', (code, patch) => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() =>
        createVercelApp({ ...productionEnvironment, VERCEL_ENV: 'preview', ...patch }),
      ).toThrow(/^Invalid API configuration$/);
      expect(errorLog).toHaveBeenCalledWith(`API configuration invalid: ${code}`);
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain('sensitive-');
    } finally {
      errorLog.mockRestore();
    }
  });

  it('builds the existing app without listening or installing signal handlers', async () => {
    const sigintListeners = process.listenerCount('SIGINT');
    const sigtermListeners = process.listenerCount('SIGTERM');
    app = createVercelApp(productionEnvironment, {
      redis: withAllowedVisitorLimit({
        eval: async () => {
          throw new Error('Unexpected Redis command');
        },
      }),
    });

    const health = await app.inject({ method: 'GET', url: '/health' });
    const invalid = await app.inject({
      method: 'GET',
      url: '/api/v1/locations?query=a',
      headers: visitorHeaders,
    });

    expect(app.server.listening).toBe(false);
    expect(process.listenerCount('SIGINT')).toBe(sigintListeners);
    expect(process.listenerCount('SIGTERM')).toBe(sigtermListeners);
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: 'ok' });
    expect(health.headers['x-request-id']).toEqual(expect.any(String));
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        requestId: invalid.headers['x-request-id'],
        details: [{ field: 'request', reason: 'invalid' }],
      },
    });
  });

  it('blocks both routes when Redis is unavailable before any provider fetch', async () => {
    const redis: UpstashRestClient = {
      eval: async () => {
        throw new UpstashUnavailable();
      },
    };
    const providerFetch = vi.fn<typeof fetch>(async () => new Response('{}'));
    app = createVercelApp(productionEnvironment, { redis, providerFetch });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/locations?query=Paris',
      headers: visitorHeaders,
    });
    const forecast = await app.inject({
      method: 'GET',
      url: '/api/v1/forecast?latitude=-23.548&longitude=-46.636&timezone=America%2FSao_Paulo',
      headers: visitorHeaders,
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service temporarily unavailable',
        requestId: response.headers['x-request-id'],
      },
    });
    expect(forecast.statusCode).toBe(503);
    expect(forecast.json()).toEqual({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service temporarily unavailable',
        requestId: forecast.headers['x-request-id'],
      },
    });
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it('reserves the route-specific weight before either provider request', async () => {
    const order: string[] = [];
    const redis: UpstashRestClient = {
      async eval(script, _keys, args) {
        if (script === CHECK_CIRCUIT_SCRIPT) {
          order.push('check');
          return 1;
        }
        if (script === RESERVE_QUOTA_SCRIPT) {
          order.push(`reserve:${args[0]}`);
          return 1;
        }
        throw new Error('Unexpected Redis command');
      },
    };
    const providerFetch = vi.fn<typeof fetch>(async (input) => {
      order.push('fetch');
      const payload = String(input).includes('geocoding-api')
        ? {
            results: [
              {
                id: 1,
                name: 'Paris',
                country: 'France',
                country_code: 'FR',
                latitude: 48.86,
                longitude: 2.35,
                timezone: 'Europe/Paris',
                feature_code: 'PPLC',
              },
            ],
          }
        : forecastWithHourly;
      return new Response(JSON.stringify(payload), {
        headers: { 'content-type': 'application/json' },
      });
    });
    app = createVercelApp(productionEnvironment, {
      redis: withAllowedVisitorLimit(redis),
      providerFetch,
    });

    const locations = await app.inject({
      method: 'GET',
      url: '/api/v1/locations?query=Paris',
      headers: visitorHeaders,
    });
    const forecast = await app.inject({
      method: 'GET',
      url: '/api/v1/forecast?latitude=-23.548&longitude=-46.636&timezone=America%2FSao_Paulo',
      headers: visitorHeaders,
    });
    const cachedLocations = await app.inject({
      method: 'GET',
      url: '/api/v1/locations?query=Paris',
      headers: visitorHeaders,
    });
    const invalid = await app.inject({
      method: 'GET',
      url: '/api/v1/locations?query=a',
      headers: visitorHeaders,
    });
    const health = await app.inject({ method: 'GET', url: '/health' });

    expect(locations.statusCode).toBe(200);
    expect(forecast.statusCode).toBe(200);
    expect(cachedLocations.statusCode).toBe(200);
    expect(invalid.statusCode).toBe(400);
    expect(health.statusCode).toBe(200);
    expect(order).toEqual(['check', 'reserve:1000', 'fetch', 'check', 'reserve:2000', 'fetch']);
    expect(providerFetch).toHaveBeenCalledTimes(2);
    expect(
      providerFetch.mock.calls.every(
        (call) => !new Headers(call[1]?.headers).has('x-forwarded-for'),
      ),
    ).toBe(true);
  });

  it('returns safe 503 on quota denial without contacting either provider', async () => {
    const redis: UpstashRestClient = {
      eval: async (script) => (script === CHECK_CIRCUIT_SCRIPT ? 1 : 0),
    };
    const providerFetch = vi.fn<typeof fetch>(async () => new Response('{}'));
    app = createVercelApp(productionEnvironment, {
      redis: withAllowedVisitorLimit(redis),
      providerFetch,
    });

    const locations = await app.inject({
      method: 'GET',
      url: '/api/v1/locations?query=Paris',
      headers: visitorHeaders,
    });
    const forecast = await app.inject({
      method: 'GET',
      url: '/api/v1/forecast?latitude=-23.548&longitude=-46.636&timezone=America%2FSao_Paulo',
      headers: visitorHeaders,
    });

    expect(locations.statusCode).toBe(503);
    expect(forecast.statusCode).toBe(503);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it('opens only the geocoding circuit on external 429 and blocks the next miss before reservation', async () => {
    const open = new Set<string>();
    let reservations = 0;
    const redis: UpstashRestClient = {
      async eval(script, keys) {
        const key = keys[0];
        if (!key) throw new Error('Missing circuit key');
        if (script === CHECK_CIRCUIT_SCRIPT) return open.has(key) ? 0 : 1;
        if (script === RESERVE_QUOTA_SCRIPT) {
          reservations += 1;
          return 1;
        }
        if (script === TRIP_CIRCUIT_SCRIPT) {
          open.add(key);
          return 1;
        }
        throw new Error('Unexpected Redis command');
      },
    };
    const providerFetch = vi.fn<typeof fetch>(async (input) =>
      String(input).includes('geocoding-api')
        ? new Response('{}', { status: 429 })
        : new Response(JSON.stringify(forecastWithHourly), {
            headers: { 'content-type': 'application/json' },
          }),
    );
    app = createVercelApp(productionEnvironment, {
      redis: withAllowedVisitorLimit(redis),
      providerFetch,
    });

    const first = await app.inject({
      method: 'GET',
      url: '/api/v1/locations?query=Paris',
      headers: visitorHeaders,
    });
    const forecast = await app.inject({
      method: 'GET',
      url: '/api/v1/forecast?latitude=-23.548&longitude=-46.636&timezone=America%2FSao_Paulo',
      headers: visitorHeaders,
    });
    const second = await app.inject({
      method: 'GET',
      url: '/api/v1/locations?query=Lisboa',
      headers: visitorHeaders,
    });

    expect(first.statusCode).toBe(503);
    expect(forecast.statusCode).toBe(200);
    expect(second.statusCode).toBe(503);
    expect(reservations).toBe(2);
    expect(providerFetch).toHaveBeenCalledTimes(2);
  });

  it('rejects missing or unsafe configuration without including its value', () => {
    expect(() => createVercelApp({})).toThrow('Invalid API configuration');
    expect(() =>
      createVercelApp({
        ...productionEnvironment,
        CORS_ALLOWED_ORIGINS: 'http://private.example.com',
      }),
    ).toThrow('Invalid API configuration');
    expect(() =>
      createVercelApp({
        ...productionEnvironment,
        OPEN_METEO_FORECAST_CREDITS: undefined,
      }),
    ).toThrow(/^Invalid API configuration$/);
  });

  it.each([
    ['missing Redis URL', { UPSTASH_REDIS_REST_URL: undefined }],
    ['malformed Redis URL', { UPSTASH_REDIS_REST_URL: 'not-a-url' }],
    ['non-HTTPS Redis URL', { UPSTASH_REDIS_REST_URL: 'http://test-redis.upstash.io' }],
    [
      'Redis URL with credentials',
      { UPSTASH_REDIS_REST_URL: 'https://user:pass@test-redis.upstash.io' },
    ],
    ['Redis URL with path', { UPSTASH_REDIS_REST_URL: 'https://test-redis.upstash.io/other' }],
    ['Redis URL with query', { UPSTASH_REDIS_REST_URL: 'https://test-redis.upstash.io/?x=1' }],
    ['missing Redis token', { UPSTASH_REDIS_REST_TOKEN: undefined }],
    ['blank Redis token', { UPSTASH_REDIS_REST_TOKEN: '  ' }],
    ['missing HMAC key', { RATE_LIMIT_HMAC_KEY: undefined }],
    ['short HMAC key', { RATE_LIMIT_HMAC_KEY: 'ab'.repeat(31) }],
    ['non-hex HMAC key', { RATE_LIMIT_HMAC_KEY: 'z'.repeat(64) }],
    ['missing cache HMAC key', { CACHE_HMAC_KEY: undefined }],
    ['short cache HMAC key', { CACHE_HMAC_KEY: 'cd'.repeat(31) }],
    ['non-hex cache HMAC key', { CACHE_HMAC_KEY: 'z'.repeat(64) }],
    ['reused rate-limit HMAC key', { CACHE_HMAC_KEY: 'ab'.repeat(32) }],
  ])('rejects %s without exposing configuration', (_case, values) => {
    expect(() => createVercelApp({ ...productionEnvironment, ...values })).toThrow(
      /^Invalid API configuration$/,
    );
  });
});
