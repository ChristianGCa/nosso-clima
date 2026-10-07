import { Writable } from 'node:stream';

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../src/backend-app.js';
import { parseEnvironment } from '../../src/config/env.js';
import { RATE_LIMIT_GROUP } from '../../src/plugins/rate-limit.js';

let app: FastifyInstance | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  await app?.close();
  app = undefined;
});

describe('inbound rate limiting', () => {
  it('accepts sixty global requests and rejects the next with stable error and retry headers', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 8, 22, 12));
    const logCapture = createLogCapture();
    const testApp = buildApp({
      logger: {
        level: 'info',
        stream: logCapture.stream,
      },
    });
    app = testApp;

    const acceptedResponses = await Promise.all(
      Array.from({ length: 60 }, () => testApp.inject({ method: 'GET', url: '/health' })),
    );
    const rejectedResponse = await testApp.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://localhost:5173' },
    });

    expect(acceptedResponses).toHaveLength(60);
    expect(acceptedResponses.every((response) => response.statusCode === 200)).toBe(true);
    expect(rejectedResponse.statusCode).toBe(429);
    expect(rejectedResponse.headers['x-ratelimit-limit']).toBe('60');
    expect(rejectedResponse.headers['x-ratelimit-remaining']).toBe('0');
    expect(rejectedResponse.headers['x-ratelimit-reset']).toBe('60');
    expect(rejectedResponse.headers['retry-after']).toBe('60');
    expect(rejectedResponse.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(rejectedResponse.headers['content-security-policy']).toEqual(expect.any(String));
    expect(rejectedResponse.json()).toEqual({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests',
        requestId: rejectedResponse.headers['x-request-id'],
      },
    });

    expect(readLogRecords(logCapture.readText())).toContainEqual(
      expect.objectContaining({
        event: 'rate_limit_rejected',
        requestId: rejectedResponse.headers['x-request-id'],
        scope: 'global',
      }),
    );
  });

  it('resets the global counter when its configured window expires', async () => {
    let now = Date.UTC(2026, 8, 22, 12);
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const config = parseEnvironment({
      API_RATE_LIMIT_MAX: '2',
      API_RATE_LIMIT_WINDOW_MS: '1000',
    });
    app = buildApp({ config });

    const firstResponse = await app.inject({ method: 'GET', url: '/health' });
    const secondResponse = await app.inject({ method: 'GET', url: '/health' });
    const rejectedResponse = await app.inject({ method: 'GET', url: '/health' });

    now += 1_000;
    const resetResponse = await app.inject({ method: 'GET', url: '/health' });

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);
    expect(rejectedResponse.statusCode).toBe(429);
    expect(resetResponse.statusCode).toBe(200);
    expect(resetResponse.headers['x-ratelimit-remaining']).toBe('1');
  });

  it('enforces independent limits for location and weather route groups', async () => {
    let now = Date.UTC(2026, 8, 22, 12);
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const config = parseEnvironment({ API_RATE_LIMIT_MAX: '100' });
    const testApp = buildApp({ config, registerRoutes: registerRateLimitedRoutes });
    app = testApp;

    const acceptedLocationResponses = await Promise.all(
      Array.from({ length: 30 }, () => testApp.inject({ method: 'GET', url: '/test/locations' })),
    );
    const rejectedLocationResponse = await testApp.inject({
      method: 'GET',
      url: '/test/locations',
    });
    const acceptedWeatherResponses = await Promise.all(
      Array.from({ length: 15 }, () => testApp.inject({ method: 'GET', url: '/test/weather' })),
    );
    const rejectedWeatherResponse = await testApp.inject({
      method: 'GET',
      url: '/test/weather',
    });

    now += 60_000;
    const resetWeatherResponse = await testApp.inject({ method: 'GET', url: '/test/weather' });

    expect(acceptedLocationResponses.every((response) => response.statusCode === 200)).toBe(true);
    expect(rejectedLocationResponse.statusCode).toBe(429);
    expect(rejectedLocationResponse.headers['x-ratelimit-limit']).toBe('30');
    expect(rejectedLocationResponse.json().error.code).toBe('RATE_LIMITED');
    expect(acceptedWeatherResponses.every((response) => response.statusCode === 200)).toBe(true);
    expect(rejectedWeatherResponse.statusCode).toBe(429);
    expect(rejectedWeatherResponse.headers['x-ratelimit-limit']).toBe('15');
    expect(rejectedWeatherResponse.json().error.code).toBe('RATE_LIMITED');
    expect(resetWeatherResponse.statusCode).toBe(200);
    expect(resetWeatherResponse.headers['x-ratelimit-remaining']).toBe('14');
  });

  it('does not let alternating route groups bypass the aggregate limit', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 8, 22, 12));
    const config = parseEnvironment({ API_RATE_LIMIT_MAX: '4' });
    app = buildApp({ config, registerRoutes: registerRateLimitedRoutes });

    const acceptedResponses = await Promise.all([
      app.inject({ method: 'GET', url: '/test/locations' }),
      app.inject({ method: 'GET', url: '/test/weather' }),
      app.inject({ method: 'GET', url: '/test/locations' }),
      app.inject({ method: 'GET', url: '/test/weather' }),
    ]);
    const rejectedResponse = await app.inject({ method: 'GET', url: '/test/locations' });

    expect(acceptedResponses.every((response) => response.statusCode === 200)).toBe(true);
    expect(rejectedResponse.statusCode).toBe(429);
    expect(rejectedResponse.headers['x-ratelimit-limit']).toBe('4');
    expect(rejectedResponse.json().error.code).toBe('RATE_LIMITED');
  });

  it('counts unknown and malformed requests without trusting forwarded addresses', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 8, 22, 12));
    const logCapture = createLogCapture();
    const config = parseEnvironment({ API_RATE_LIMIT_MAX: '2' });
    app = buildApp({
      config,
      logger: {
        level: 'info',
        stream: logCapture.stream,
      },
      registerRoutes(testApp) {
        testApp.post('/test/json', () => ({ ok: true }));
      },
    });

    const unknownResponse = await app.inject({
      method: 'GET',
      url: '/missing?search=private-city',
      headers: { 'x-forwarded-for': '203.0.113.10' },
    });
    const malformedResponse = await app.inject({
      method: 'POST',
      url: '/test/json',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '198.51.100.20',
      },
      payload: '{"invalid":',
    });
    const rejectedResponse = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { forwarded: 'for=192.0.2.30' },
    });
    const repeatedRejection = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-forwarded-for': '192.0.2.40' },
    });

    expect(unknownResponse.statusCode).toBe(404);
    expect(malformedResponse.statusCode).toBe(400);
    expect(rejectedResponse.statusCode).toBe(429);
    expect(repeatedRejection.statusCode).toBe(429);

    const logText = logCapture.readText();
    expect(logText).not.toContain('private-city');
    expect(logText).not.toContain('203.0.113.10');
    expect(logText).not.toContain('198.51.100.20');
    expect(logText).not.toContain('192.0.2.30');
    expect(logText).not.toContain('192.0.2.40');
  });

  it('normalizes IPv6 clients to prevent address rotation inside one subnet', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 8, 22, 12));
    const config = parseEnvironment({ API_RATE_LIMIT_MAX: '2' });
    app = buildApp({ config });

    const firstResponse = await app.inject({
      method: 'GET',
      url: '/health',
      remoteAddress: '2001:db8:abcd:1234::1',
    });
    const secondResponse = await app.inject({
      method: 'GET',
      url: '/health',
      remoteAddress: '2001:db8:abcd:1234::2',
    });
    const rejectedResponse = await app.inject({
      method: 'GET',
      url: '/health',
      remoteAddress: '2001:db8:abcd:1234::3',
    });

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);
    expect(rejectedResponse.statusCode).toBe(429);
  });

  it.each([
    ['allowed', { origin: 'http://localhost:5173', 'access-control-request-method': 'GET' }, 204],
    [
      'unlisted',
      { origin: 'https://unlisted.example.com', 'access-control-request-method': 'GET' },
      204,
    ],
    ['malformed', { origin: 'http://localhost:5173' }, 400],
  ] as const)(
    'counts %s CORS preflights before responding',
    async (_name, headers, allowedStatus) => {
      const config = parseEnvironment({ API_RATE_LIMIT_MAX: '2' });
      app = buildApp({ config });

      const responses = [];
      for (let index = 0; index < 3; index += 1) {
        responses.push(await app.inject({ method: 'OPTIONS', url: '/health', headers }));
      }

      expect(responses.map((response) => response.statusCode)).toEqual([
        allowedStatus,
        allowedStatus,
        429,
      ]);
      expect(responses[2]?.json()).toEqual({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests',
          requestId: responses[2]?.headers['x-request-id'],
        },
      });
    },
  );

  it('counts malformed URL paths and gives them the public error envelope and request ID', async () => {
    const config = parseEnvironment({ API_RATE_LIMIT_MAX: '2' });
    const logCapture = createLogCapture();
    app = buildApp({ config, logger: { level: 'info', stream: logCapture.stream } });

    const responses = [];
    for (let index = 0; index < 3; index += 1) {
      responses.push(await app.inject({ method: 'GET', url: '/%' }));
    }

    expect(responses.map((response) => response.statusCode)).toEqual([400, 400, 429]);
    expect(responses.map((response) => response.json().error.code)).toEqual([
      'VALIDATION_ERROR',
      'VALIDATION_ERROR',
      'RATE_LIMITED',
    ]);
    for (const response of responses) {
      expect(response.headers['x-request-id']).toEqual(expect.any(String));
      expect(response.json().error.requestId).toBe(response.headers['x-request-id']);
      expect(response.body).not.toContain('FST_ERR_BAD_URL');
    }
    const completionLogs = readLogRecords(logCapture.readText()).filter(
      (record) => record.event === 'request_completed',
    );
    expect(completionLogs.map((record) => record.requestId)).toEqual(
      responses.map((response) => response.headers['x-request-id']),
    );
  });

  it('shares the global budget between malformed paths, preflights and normal routes', async () => {
    app = buildApp({ config: parseEnvironment({ API_RATE_LIMIT_MAX: '2' }) });

    const malformed = await app.inject({ method: 'GET', url: '/%' });
    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/health',
      headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'GET' },
    });
    const health = await app.inject({ method: 'GET', url: '/health' });

    expect(malformed.statusCode).toBe(400);
    expect(preflight.statusCode).toBe(204);
    expect(health.statusCode).toBe(429);
  });
});

function registerRateLimitedRoutes(testApp: FastifyInstance): void {
  testApp.get(
    '/test/locations',
    { config: { rateLimitGroup: RATE_LIMIT_GROUP.LOCATION_SEARCH } },
    () => ({ ok: true }),
  );
  testApp.get(
    '/test/weather',
    { config: { rateLimitGroup: RATE_LIMIT_GROUP.WEATHER_FORECAST } },
    () => ({ ok: true }),
  );
}

type LogCapture = Readonly<{
  stream: Writable;
  readText: () => string;
}>;

function createLogCapture(): LogCapture {
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

function readLogRecords(logText: string): readonly Record<string, unknown>[] {
  return logText
    .trim()
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line): unknown => JSON.parse(line))
    .map((value) => {
      if (!isRecord(value)) {
        throw new Error('Expected every log line to contain a JSON object');
      }

      return value;
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
