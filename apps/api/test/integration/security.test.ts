import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/backend-app.js';
import { parseEnvironment } from '../../src/config/env.js';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('HTTP hardening', () => {
  it('marks success and error responses as uncacheable by browsers and the CDN', async () => {
    app = buildApp({
      registerRoutes(testApp) {
        testApp.get('/test/cache', () => ({ ok: true }));
      },
    });

    const success = await app.inject({ method: 'GET', url: '/test/cache' });
    const validationError = await app.inject({ method: 'GET', url: '/api/v1/locations' });
    const notFound = await app.inject({ method: 'GET', url: '/api/unknown' });

    expect(success.statusCode).toBe(200);
    expect(validationError.statusCode).toBe(400);
    expect(notFound.statusCode).toBe(404);
    for (const response of [success, validationError, notFound]) {
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.headers['vercel-cdn-cache-control']).toBe('no-store');
    }
  });

  it('adds CORS headers only for configured origins and permits only GET', async () => {
    const config = parseEnvironment({
      CORS_ALLOWED_ORIGINS: 'https://clima.example.com,http://localhost:4173',
    });
    app = buildApp({ config });

    const allowedResponse = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://clima.example.com' },
    });
    const rejectedResponse = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://unlisted.example.com' },
    });
    const preflightResponse = await app.inject({
      method: 'OPTIONS',
      url: '/health',
      headers: {
        origin: 'http://localhost:4173',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization',
      },
    });

    expect(allowedResponse.headers['access-control-allow-origin']).toBe(
      'https://clima.example.com',
    );
    expect(rejectedResponse.headers['access-control-allow-origin']).toBeUndefined();
    expect(preflightResponse.statusCode).toBe(204);
    expect(preflightResponse.headers['access-control-allow-origin']).toBe('http://localhost:4173');
    expect(preflightResponse.headers['access-control-allow-methods']).toBe('GET');
    expect(preflightResponse.headers['access-control-allow-headers']).toBe('');
  });

  it('adds default Helmet security headers to responses', async () => {
    app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.headers['content-security-policy']).toEqual(expect.any(String));
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('uses the public error envelope for malformed CORS preflight requests', async () => {
    app = buildApp();

    const response = await app.inject({
      method: 'OPTIONS',
      url: '/health',
      headers: { origin: 'http://localhost:5173' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        requestId: response.headers['x-request-id'],
      },
    });
  });

  it('accepts a 16 KiB body and rejects the next byte before route work', async () => {
    let handledRequests = 0;
    app = buildApp({
      registerRoutes(testApp) {
        testApp.post('/test/body', () => {
          handledRequests += 1;
          return { ok: true };
        });
      },
    });

    const acceptedResponse = await app.inject({
      method: 'POST',
      url: '/test/body',
      headers: { 'content-type': 'text/plain' },
      payload: 'a'.repeat(16 * 1024),
    });
    const rejectedResponse = await app.inject({
      method: 'POST',
      url: '/test/body',
      headers: { 'content-type': 'text/plain' },
      payload: 'a'.repeat(16 * 1024 + 1),
    });

    expect(acceptedResponse.statusCode).toBe(200);
    expect(rejectedResponse.statusCode).toBe(413);
    expect(rejectedResponse.json()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        requestId: rejectedResponse.headers['x-request-id'],
        details: [{ field: 'request', reason: 'invalid' }],
      },
    });
    expect(handledRequests).toBe(1);
  });

  it('ignores forwarded client addresses while proxy trust is disabled', async () => {
    app = buildApp({
      registerRoutes(testApp) {
        testApp.get('/test/client-address', (request) => ({ clientAddress: request.ip }));
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/test/client-address',
      remoteAddress: '127.0.0.1',
      headers: {
        forwarded: 'for=203.0.113.20',
        'x-forwarded-for': '198.51.100.10',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ clientAddress: '127.0.0.1' });
  });
});
