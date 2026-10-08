import { Writable } from 'node:stream';

import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from 'typebox';
import { Value } from 'typebox/value';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/backend-app.js';
import { ApiError } from '../../src/errors/api-error.js';
import { ProviderAccessFailure } from '../../src/infrastructure/reserved-open-meteo-fetch.js';
import { ApiErrorResponseSchema } from '../../src/schemas/errors.js';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('public error envelope', () => {
  it('uses the stable envelope for unknown routes', async () => {
    app = buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/not-a-route',
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(Value.Check(ApiErrorResponseSchema, body)).toBe(true);
    expect(body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Resource not found',
        requestId: response.headers['x-request-id'],
      },
    });
  });

  it('sanitizes validation errors and their details', async () => {
    app = buildApp({ registerRoutes: registerTestRoutes });

    const response = await app.inject({
      method: 'GET',
      url: '/test/validated?city=&unexpected=secret-value',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        requestId: response.headers['x-request-id'],
        details: [{ field: 'request', reason: 'invalid' }],
      },
    });
    expect(response.body).not.toContain('city');
    expect(response.body).not.toContain('unexpected');
    expect(response.body).not.toContain('secret-value');
  });

  it('uses the validation envelope for malformed JSON', async () => {
    app = buildApp({ registerRoutes: registerTestRoutes });

    const response = await app.inject({
      method: 'POST',
      url: '/test/validated',
      headers: {
        'content-type': 'application/json',
      },
      payload: '{"city":',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        requestId: response.headers['x-request-id'],
        details: [{ field: 'request', reason: 'invalid' }],
      },
    });
    expect(response.body).not.toContain('city');
  });

  it('preserves the unsupported media type status with a safe public envelope', async () => {
    app = buildApp({ registerRoutes: registerTestRoutes });

    const response = await app.inject({
      method: 'POST',
      url: '/test/validated',
      headers: { 'content-type': 'application/xml' },
      payload: '<city>private-city</city>',
    });

    expect(response.statusCode).toBe(415);
    expect(response.json()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        requestId: response.headers['x-request-id'],
        details: [{ field: 'request', reason: 'invalid' }],
      },
    });
    expect(response.body).not.toContain('private-city');
  });

  it.each([
    ['VALIDATION_ERROR', 400, 'Invalid request'],
    ['NOT_FOUND', 404, 'Resource not found'],
    ['RATE_LIMITED', 429, 'Too many requests'],
    ['SERVICE_UNAVAILABLE', 503, 'Service temporarily unavailable'],
    ['INTERNAL_ERROR', 500, 'Internal server error'],
  ] as const)('maps %s to its fixed status and message', async (code, status, message) => {
    app = buildApp({ registerRoutes: registerTestRoutes });

    const response = await app.inject({
      method: 'GET',
      url: `/test/api-error/${code}`,
    });

    expect(response.statusCode).toBe(status);
    expect(response.json()).toEqual({
      error: {
        code,
        message,
        requestId: response.headers['x-request-id'],
      },
    });
  });

  it('replaces unexpected error data with the generic internal error', async () => {
    const logCapture = createLogCapture();
    app = buildApp({
      logger: {
        level: 'info',
        stream: logCapture.stream,
      },
      registerRoutes: registerTestRoutes,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/test/unexpected',
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        requestId: response.headers['x-request-id'],
      },
    });
    expect(response.body).not.toContain('database-password');
    expect(response.body).not.toContain('/srv/private/config.json');
    expect(response.body).not.toContain('stack');

    const logText = logCapture.readText();
    expect(logText).not.toContain('database-password');
    expect(logText).not.toContain('/srv/private/config.json');
    expect(logText).not.toContain('stack');
    expect(logText).toContain('unexpected_error');
    expect(logText).toContain('INTERNAL_ERROR');
    expect(logText).toContain('errorType');
  });

  it.each(['circuit_open', 'quota_denied', 'redis_unavailable', 'upstream_rate_limited'] as const)(
    'classifies %s without logging request data',
    async (reason) => {
      const capture = createLogCapture();
      app = buildApp({
        logger: { level: 'info', stream: capture.stream },
        registerRoutes: registerTestRoutes,
      });

      const response = await app.inject({
        method: 'GET',
        url: `/test/provider-failure/${reason}?query=private-city`,
        headers: { 'x-test-canary': 'private-canary' },
      });

      expect(response.statusCode).toBe(503);
      expect(response.json().error.code).toBe('SERVICE_UNAVAILABLE');
      const logs = capture
        .readText()
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      expect(logs).toContainEqual(
        expect.objectContaining({
          event: 'provider_access_rejected',
          reason,
          requestId: response.headers['x-request-id'],
        }),
      );
      expect(capture.readText()).not.toMatch(/private-city|private-canary/);
    },
  );

  it('does not turn an unexpected error with status 400 into a validation error', async () => {
    app = buildApp({ registerRoutes: registerTestRoutes });

    const response = await app.inject({ method: 'GET', url: '/test/unexpected-400' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        requestId: response.headers['x-request-id'],
      },
    });
  });

  it('maps an unexpected framework routing failure to an internal error', async () => {
    app = buildApp({
      registerRoutes(testApp) {
        const strategy = {
          name: 'test-failure',
          storage() {
            const values = new Map<string, unknown>();
            return {
              get: (key: string) => values.get(key) ?? null,
              set: (key: string, value: unknown) => {
                values.set(key, value);
              },
            };
          },
          deriveConstraint(_request: unknown, _context: unknown, done: (error: Error) => void) {
            done(new Error('private routing failure'));
          },
          validate: () => true,
        } as unknown as Parameters<FastifyInstance['addConstraintStrategy']>[0];
        testApp.addConstraintStrategy(strategy);
        testApp.get('/test/framework-error', { constraints: { 'test-failure': 'active' } }, () => ({
          ok: true,
        }));
      },
    });

    const response = await app.inject({ method: 'GET', url: '/test/framework-error' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        requestId: response.headers['x-request-id'],
      },
    });
    expect(response.body).not.toContain('private routing failure');
  });

  it('sanitizes unexpected non-Error values', async () => {
    app = buildApp({ registerRoutes: registerTestRoutes });

    const response = await app.inject({
      method: 'GET',
      url: '/test/unexpected-value',
    });

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('private-thrown-value');
    expect(response.json()).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        requestId: response.headers['x-request-id'],
      },
    });
  });
});

function registerTestRoutes(testApp: FastifyInstance): void {
  testApp.withTypeProvider<TypeBoxTypeProvider>().get(
    '/test/validated',
    {
      schema: {
        querystring: Type.Object(
          {
            city: Type.String({ minLength: 1 }),
          },
          { additionalProperties: false },
        ),
      },
    },
    () => ({ ok: true }),
  );

  testApp.get<{
    Params: {
      code:
        | 'VALIDATION_ERROR'
        | 'NOT_FOUND'
        | 'RATE_LIMITED'
        | 'SERVICE_UNAVAILABLE'
        | 'INTERNAL_ERROR';
    };
  }>('/test/api-error/:code', (request) => {
    throw new ApiError(request.params.code);
  });

  testApp.get('/test/unexpected', () => {
    const error = new Error('database-password at /srv/private/config.json');
    error.stack = 'stack with database-password at /srv/private/config.json';
    throw error;
  });

  testApp.get('/test/unexpected-400', () => {
    throw Object.assign(new Error('private failure'), { statusCode: 400 });
  });

  testApp.post('/test/validated', () => ({ ok: true }));

  testApp.get('/test/unexpected-value', () => {
    throw 'private-thrown-value';
  });

  testApp.get<{ Params: { reason: ProviderAccessFailure['kind'] } }>(
    '/test/provider-failure/:reason',
    (request) => {
      throw new ProviderAccessFailure(request.params.reason);
    },
  );
}

function createLogCapture(): Readonly<{ stream: Writable; readText: () => string }> {
  let output = '';
  const stream = new Writable({
    write(chunk: unknown, _encoding, callback): void {
      output += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      callback();
    },
  });

  return {
    stream,
    readText: () => output,
  };
}
