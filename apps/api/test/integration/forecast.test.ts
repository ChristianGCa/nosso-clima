import { Writable } from 'node:stream';

import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../../src/app.js';
import { parseEnvironment } from '../../src/config/env.js';
import {
  FORECAST_ATTRIBUTION,
  type ForecastLocation,
} from '../../src/forecast/forecast-contract.js';
import { normalizeForecastResponse } from '../../src/forecast/open-meteo-forecast.js';
import { registerForecastRoute } from '../../src/routes/forecast.js';
import realForecast from '../fixtures/open-meteo-forecast.json' with { type: 'json' };

const jsonHeaders = { 'content-type': 'application/json' };
let app: FastifyInstance | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  await app?.close();
  app = undefined;
});

/** Build a Response that contains the fixture JSON as if returned by Open-Meteo. */
function okForecastResponse(): Response {
  return new Response(JSON.stringify(realForecast), { headers: jsonHeaders });
}

const VALID_QUERY =
  '/api/v1/forecast?latitude=-23.548&longitude=-46.636&timezone=America%2FSao_Paulo';

describe('GET /api/v1/forecast', () => {
  it('uses the location validated in preValidation after the raw URL changes', async () => {
    const service = {
      get: vi.fn(async (_location: ForecastLocation) =>
        normalizeForecastResponse(
          realForecast,
          {
            latitude: -23.548,
            longitude: -46.636,
            timezone: 'America/Sao_Paulo',
          },
          '2026-09-23T23:00:00.000Z',
        ),
      ),
    };
    app = Fastify();
    app.addHook('preHandler', (request, _reply, done) => {
      request.raw.url = '/api/v1/forecast?latitude=1&longitude=2&timezone=America%2FSao_Paulo';
      done();
    });
    registerForecastRoute(app, service);

    const response = await app.inject({ method: 'GET', url: VALID_QUERY });

    expect(response.statusCode).toBe(200);
    expect(service.get).toHaveBeenCalledOnce();
    expect(service.get.mock.calls[0]?.[0]).toEqual({
      latitude: -23.548,
      longitude: -46.636,
      timezone: 'America/Sao_Paulo',
    });
  });

  it('is available from plain buildApp and returns the exact schema with attribution and request ID', async () => {
    app = buildApp({ fetchImpl: async () => okForecastResponse() });

    const response = await app.inject({ method: 'GET', url: VALID_QUERY });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
    const body = response.json() as Record<string, unknown>;
    expect(body.attribution).toEqual(FORECAST_ATTRIBUTION);
    expect(body.timezone).toBe('America/Sao_Paulo');
    expect(body.retrievedAtUtc).toEqual(expect.any(String));
    expect(typeof body.current).toBe('object');
    expect(Array.isArray(body.daily)).toBe(true);
    expect((body.daily as unknown[]).length).toBe(7);
  });

  it('creates the weather-forecast cache exactly once in buildApp', async () => {
    let cacheCreateCount = 0;
    const originalBuildApp = buildApp;
    // Verify via the double-registration guard: calling createCache('weather-forecast')
    // a second time via registerRoutes should throw.
    const app2 = originalBuildApp({
      fetchImpl: async () => okForecastResponse(),
      registerRoutes(_fastify, platform) {
        expect(() => platform.createCache('weather-forecast')).toThrow(/already initialized/);
        cacheCreateCount += 1;
      },
    });
    try {
      await app2.ready();
      expect(cacheCreateCount).toBe(1);
    } finally {
      await app2.close();
    }
  });

  it.each([
    '/api/v1/forecast',
    '/api/v1/forecast?latitude=-23.548&longitude=-46.636&timezone=America%2FSao_Paulo&foo=1',
    '/api/v1/forecast?latitude=-23.548&longitude=-46.636&timezone=America%2FSao_Paulo&latitude=-23.548',
    '/api/v1/forecast?latitude=91&longitude=-46.636&timezone=America%2FSao_Paulo',
    '/api/v1/forecast?latitude=-23.548&longitude=181&timezone=America%2FSao_Paulo',
    '/api/v1/forecast?latitude=-23.548&longitude=-46.636&timezone=UTC%2B03%3A00',
    '/api/v1/forecast?latitude=-23.548&longitude=-46.636&timezone=',
    '/api/v1/forecast?latitude=NaN&longitude=-46.636&timezone=America%2FSao_Paulo',
    '/api/v1/forecast?latitude=-23.548&longitude=Infinity&timezone=America%2FSao_Paulo',
    '/api/v1/forecast?latitude=-23.548%2C0&longitude=-46.636&timezone=America%2FSao_Paulo',
  ])('rejects invalid query %s before any outbound call', async (url) => {
    const fetchImpl = vi.fn<typeof fetch>(async () => okForecastResponse());
    app = buildApp({ fetchImpl });

    const response = await app.inject({ method: 'GET', url });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        requestId: response.headers['x-request-id'],
        details: [{ field: 'request', reason: 'invalid' }],
      },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('enforces both the 15-request weather-forecast bucket and 60-request global bucket', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 8, 23, 12));
    const fetchImpl = vi.fn<typeof fetch>(async () => okForecastResponse());
    const testApp = buildApp({ fetchImpl });
    app = testApp;

    const forecastResponses = await Promise.all(
      Array.from({ length: 15 }, () => testApp.inject({ method: 'GET', url: VALID_QUERY })),
    );
    const groupRejected = await testApp.inject({ method: 'GET', url: VALID_QUERY });
    const healthResponses = await Promise.all(
      Array.from({ length: 44 }, () => testApp.inject({ method: 'GET', url: '/health' })),
    );
    const globalRejected = await testApp.inject({ method: 'GET', url: '/health' });

    expect(forecastResponses.every((r) => r.statusCode === 200)).toBe(true);
    expect(groupRejected.statusCode).toBe(429);
    expect(groupRejected.headers['x-ratelimit-limit']).toBe('15');
    expect(groupRejected.json().error.code).toBe('RATE_LIMITED');
    expect(healthResponses.every((r) => r.statusCode === 200)).toBe(true);
    expect(globalRejected.statusCode).toBe(429);
    expect(globalRejected.headers['x-ratelimit-limit']).toBe('60');
  });

  it('maps a stalled provider call to 503 when its timeout aborts', async () => {
    const abortController = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(abortController.signal);
    const fetchStarted = Promise.withResolvers<void>();
    const fetchImpl: typeof fetch = async () => {
      fetchStarted.resolve();
      return new Promise<Response>(() => {});
    };
    app = buildApp({ fetchImpl });

    const pending = app.inject({ method: 'GET', url: VALID_QUERY });
    await fetchStarted.promise;
    abortController.abort();
    const response = await pending;

    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it.each([
    ['status', async () => new Response('private-body', { status: 429, headers: jsonHeaders })],
    ['content_type', async () => new Response('{}', { headers: { 'content-type': 'text/plain' } })],
    ['invalid_json', async () => new Response('{', { headers: jsonHeaders })],
    ['invalid_response', async () => new Response('{}', { headers: jsonHeaders })],
    [
      'network',
      async () => {
        throw new TypeError('private upstream URL');
      },
    ],
    ['body_too_large', async () => new Response(' '.repeat(65_537), { headers: jsonHeaders })],
  ] as const)(
    'maps %s provider failure to a safe 503 with bounded correlated warning',
    async (kind, fetchImpl) => {
      let logText = '';
      const stream = new Writable({
        write(chunk, _encoding, callback) {
          logText += String(chunk);
          callback();
        },
      });
      app = buildApp({ fetchImpl, logger: { level: 'info', stream } });

      const response = await app.inject({
        method: 'GET',
        url: VALID_QUERY,
        remoteAddress: '203.0.113.33',
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Service temporarily unavailable',
          requestId: response.headers['x-request-id'],
        },
      });
      const records = logText
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(records).toContainEqual(
        expect.objectContaining({
          event: 'forecast_upstream_failed',
          requestId: response.headers['x-request-id'],
          failureKind: kind,
          ...(kind === 'status' ? { upstreamStatus: 429 } : {}),
        }),
      );
      expect(records.filter((r) => r.event === 'forecast_upstream_failed')).toHaveLength(1);
      // Privacy: no coordinates, timezone, cache key, raw body or client IP
      expect(logText).not.toContain('-23.548');
      expect(logText).not.toContain('-46.636');
      expect(logText).not.toContain('Sao_Paulo');
      expect(logText).not.toContain('private-body');
      expect(logText).not.toContain('203.0.113.33');
      expect(logText).not.toContain('weather-forecast:v1:');
      expect(logText).not.toContain('api.open-meteo.com');
      expect(
        records.every((r) => Object.keys(r).filter((k) => k === 'requestId').length === 1),
      ).toBe(true);
    },
  );

  it('preserves unexpected defects as safe 500 errors', async () => {
    const defectiveResponse = new Response('{}', { headers: jsonHeaders });
    Object.defineProperty(defectiveResponse, 'status', {
      get() {
        throw new Error('private internal defect');
      },
    });
    app = buildApp({ fetchImpl: async () => defectiveResponse });

    const response = await app.inject({ method: 'GET', url: VALID_QUERY });

    expect(response.statusCode).toBe(500);
    expect(response.json().error).toMatchObject({
      code: 'INTERNAL_ERROR',
      requestId: response.headers['x-request-id'],
    });
    expect(response.body).not.toContain('private internal defect');
  });

  it('coalesces concurrent misses through the app-wide single-flight', async () => {
    const responseReady = Promise.withResolvers<Response>();
    const fetchStarted = Promise.withResolvers<void>();
    const fetchImpl = vi.fn<typeof fetch>(() => {
      fetchStarted.resolve();
      return responseReady.promise;
    });
    app = buildApp({ fetchImpl, config: parseEnvironment({ API_RATE_LIMIT_MAX: '100' }) });

    const first = app.inject({ method: 'GET', url: VALID_QUERY });
    // Equivalent coordinates (round to same 3 decimals)
    const equivalent = app.inject({
      method: 'GET',
      url: '/api/v1/forecast?latitude=-23.5476&longitude=-46.6364&timezone=America%2FSao_Paulo',
    });
    await fetchStarted.promise;
    responseReady.resolve(okForecastResponse());

    expect((await first).statusCode).toBe(200);
    expect((await equivalent).statusCode).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('omits coordinates, timezone and cache key from captured logs on success', async () => {
    let logText = '';
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        logText += String(chunk);
        callback();
      },
    });
    app = buildApp({
      fetchImpl: async () => okForecastResponse(),
      logger: { level: 'info', stream },
    });

    const response = await app.inject({ method: 'GET', url: VALID_QUERY });

    expect(response.statusCode).toBe(200);
    expect(logText).not.toContain('-23.548');
    expect(logText).not.toContain('-46.636');
    expect(logText).not.toContain('Sao_Paulo');
    expect(logText).not.toContain('weather-forecast:v1:');
    expect(logText).not.toContain('api.open-meteo.com');
  });
});
