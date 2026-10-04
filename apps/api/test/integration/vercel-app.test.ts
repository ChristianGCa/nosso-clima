import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createVercelApp } from '../../src/vercel-app.js';
import { RESERVE_QUOTA_SCRIPT } from '../../src/infrastructure/quota-reservation.js';
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
  OPEN_METEO_MINUTE_CREDITS: '10000',
  OPEN_METEO_HOUR_CREDITS: '50000',
  OPEN_METEO_DAY_CREDITS: '100000',
  OPEN_METEO_MONTH_CREDITS: '200000',
  OPEN_METEO_GEOCODING_CREDITS: '1000',
  OPEN_METEO_FORECAST_CREDITS: '2000',
  OPEN_METEO_429_COOLDOWN_MS: '60000',
  OPEN_METEO_PROBE_MS: '10000',
} as const;

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('Vercel Fastify entry', () => {
  it('builds the existing app without listening or installing signal handlers', async () => {
    const sigintListeners = process.listenerCount('SIGINT');
    const sigtermListeners = process.listenerCount('SIGTERM');
    app = createVercelApp(productionEnvironment);

    const health = await app.inject({ method: 'GET', url: '/health' });
    const invalid = await app.inject({ method: 'GET', url: '/api/v1/locations?query=a' });

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
    });
    const forecast = await app.inject({
      method: 'GET',
      url: '/api/v1/forecast?latitude=-23.548&longitude=-46.636&timezone=America%2FSao_Paulo',
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
    app = createVercelApp(productionEnvironment, { redis, providerFetch });

    const locations = await app.inject({ method: 'GET', url: '/api/v1/locations?query=Paris' });
    const forecast = await app.inject({
      method: 'GET',
      url: '/api/v1/forecast?latitude=-23.548&longitude=-46.636&timezone=America%2FSao_Paulo',
    });
    const cachedLocations = await app.inject({
      method: 'GET',
      url: '/api/v1/locations?query=Paris',
    });
    const invalid = await app.inject({ method: 'GET', url: '/api/v1/locations?query=a' });
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
    app = createVercelApp(productionEnvironment, { redis, providerFetch });

    const locations = await app.inject({ method: 'GET', url: '/api/v1/locations?query=Paris' });
    const forecast = await app.inject({
      method: 'GET',
      url: '/api/v1/forecast?latitude=-23.548&longitude=-46.636&timezone=America%2FSao_Paulo',
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
    app = createVercelApp(productionEnvironment, { redis, providerFetch });

    const first = await app.inject({ method: 'GET', url: '/api/v1/locations?query=Paris' });
    const forecast = await app.inject({
      method: 'GET',
      url: '/api/v1/forecast?latitude=-23.548&longitude=-46.636&timezone=America%2FSao_Paulo',
    });
    const second = await app.inject({ method: 'GET', url: '/api/v1/locations?query=Lisboa' });

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
  ])('rejects %s without exposing configuration', (_case, values) => {
    expect(() => createVercelApp({ ...productionEnvironment, ...values })).toThrow(
      /^Invalid API configuration$/,
    );
  });
});
