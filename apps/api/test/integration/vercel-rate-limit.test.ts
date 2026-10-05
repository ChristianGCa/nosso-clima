import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SHARED_VISITOR_LIMIT_SCRIPT } from '../../src/infrastructure/shared-visitor-limit.js';
import {
  type UpstashRestClient,
  UpstashUnavailable,
} from '../../src/infrastructure/upstash-rest.js';
import { createVercelApp } from '../../src/vercel-app.js';

const environment = {
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
const trustedHeaders = { 'x-vercel-forwarded-for': '203.0.113.10' };
let apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.map((app) => app.close()));
  apps = [];
  vi.restoreAllMocks();
});

function build(redis: UpstashRestClient) {
  const app = createVercelApp(environment, {
    redis,
    providerFetch: vi.fn<typeof fetch>(async () => new Response('{}')),
  });
  apps.push(app);
  return app;
}

describe('Vercel visitor limits', () => {
  it('keeps health independent of Redis and rejects missing or ambiguous identity before Redis', async () => {
    const evalCommand = vi.fn<UpstashRestClient['eval']>(async () => [1, 60_000, 59]);
    const app = build({ eval: evalCommand });
    const health = await app.inject({ method: 'GET', url: '/health' });
    const missing = await app.inject({ method: 'GET', url: '/api/v1/locations?query=Paris' });
    const spoofed = await app.inject({
      method: 'GET',
      url: '/api/v1/locations?query=Paris',
      headers: { 'x-vercel-forwarded-for': '203.0.113.10, 198.51.100.2' },
    });
    const forwardedOnly = await app.inject({
      method: 'GET',
      url: '/api/v1/locations?query=Paris',
      headers: { 'x-forwarded-for': '203.0.113.10' },
    });

    expect(health.statusCode).toBe(200);
    expect(missing.statusCode).toBe(503);
    expect(spoofed.statusCode).toBe(503);
    expect(forwardedOnly.statusCode).toBe(503);
    expect(evalCommand).not.toHaveBeenCalled();
    expect(missing.body).not.toContain('203.0.113.10');
  });

  it('ignores a spoofed x-forwarded-for when the Vercel identity is present', async () => {
    const evalCommand = vi.fn<UpstashRestClient['eval']>(async () => [1, 60_000, 59]);
    const app = build({ eval: evalCommand });
    const response = await app.inject({
      method: 'GET',
      url: '/%',
      headers: {
        ...trustedHeaders,
        'x-forwarded-for': '198.51.100.2',
      },
    });
    expect(response.statusCode).toBe(400);
    expect(evalCommand).toHaveBeenCalledOnce();
    expect(evalCommand.mock.calls[0]?.[0]).toBe(SHARED_VISITOR_LIMIT_SCRIPT);
    expect(JSON.stringify(evalCommand.mock.calls)).not.toContain('198.51.100.2');
  });

  it('uses the bounded pre-limit before Redis for excess global and group traffic', async () => {
    const evalCommand = vi.fn<UpstashRestClient['eval']>(async (script) => {
      if (script !== SHARED_VISITOR_LIMIT_SCRIPT) throw new Error('Unexpected Redis command');
      return [1, 60_000, 59];
    });
    const app = build({ eval: evalCommand });
    const globalResponses = await Promise.all(
      Array.from({ length: 61 }, () =>
        app.inject({ method: 'GET', url: '/missing', headers: trustedHeaders }),
      ),
    );
    expect(globalResponses.slice(0, 60).every((response) => response.statusCode === 404)).toBe(
      true,
    );
    expect(globalResponses[60]?.statusCode).toBe(429);
    expect(evalCommand).toHaveBeenCalledTimes(60);

    const otherApp = build({ eval: evalCommand });
    const groupResponses = await Promise.all(
      Array.from({ length: 31 }, () =>
        otherApp.inject({
          method: 'GET',
          url: '/api/v1/locations?query=a',
          headers: trustedHeaders,
        }),
      ),
    );
    expect(groupResponses.slice(0, 30).every((response) => response.statusCode === 400)).toBe(true);
    expect(groupResponses[30]?.statusCode).toBe(429);
    expect(evalCommand).toHaveBeenCalledTimes(90);
  });

  it('maps shared denial to 429 and Redis failure to safe 503', async () => {
    const denied = build({ eval: async () => [2, 59_999, 0] });
    const response = await denied.inject({
      method: 'GET',
      url: '/api/v1/forecast?latitude=invalid',
      headers: trustedHeaders,
    });
    expect(response.statusCode).toBe(429);
    expect(response.headers['retry-after']).toBe('60');
    expect(response.json().error.code).toBe('RATE_LIMITED');

    const broken = build({
      eval: async () => {
        throw new UpstashUnavailable();
      },
    });
    const failure = await broken.inject({
      method: 'GET',
      url: '/api/v1/locations?query=Paris',
      headers: trustedHeaders,
    });
    expect(failure.statusCode).toBe(503);
    expect(failure.json().error.code).toBe('SERVICE_UNAVAILABLE');
  });
});
