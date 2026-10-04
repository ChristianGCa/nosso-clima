import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { createVercelApp } from '../../src/vercel-app.js';

const productionEnvironment = {
  NODE_ENV: 'production',
  HOST: '0.0.0.0',
  LOG_LEVEL: 'silent',
  CORS_ALLOWED_ORIGINS: 'https://clima.example.com',
  UPSTASH_REDIS_REST_URL: 'https://test-redis.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'test-token-not-a-real-credential',
  RATE_LIMIT_HMAC_KEY: 'ab'.repeat(32),
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

  it('blocks provider requests until the shared quota path is connected', async () => {
    app = createVercelApp(productionEnvironment);

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
  });

  it('rejects missing or unsafe configuration without including its value', () => {
    expect(() => createVercelApp({})).toThrow('Invalid API configuration');
    expect(() =>
      createVercelApp({
        ...productionEnvironment,
        CORS_ALLOWED_ORIGINS: 'http://private.example.com',
      }),
    ).toThrow('Invalid API configuration');
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
