import { Writable } from 'node:stream';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../../src/app.js';
import { parseEnvironment } from '../../src/config/env.js';
import { LOCATION_ATTRIBUTION } from '../../src/locations/location-contract.js';

const jsonHeaders = { 'content-type': 'application/json' };
let app: FastifyInstance | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  await app?.close();
  app = undefined;
});

describe('GET /api/v1/locations', () => {
  it('is available from buildApp and returns the exact normalized response', async () => {
    let logText = '';
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        logText += String(chunk);
        callback();
      },
    });
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            results: [
              {
                id: 1,
                name: 'São Paulo',
                admin1: 'São Paulo',
                country: 'Brasil',
                country_code: 'BR',
                latitude: -23.5,
                longitude: -46.6,
                timezone: 'America/Sao_Paulo',
                feature_code: 'PPLA',
                population: 12_000_000,
              },
            ],
          }),
          { headers: jsonHeaders },
        ),
    );
    app = buildApp({ fetchImpl, logger: { level: 'info', stream } });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/locations?query=S%C3%A3o%20Paulo',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
    expect(response.json()).toEqual({
      locations: [
        {
          id: 1,
          name: 'São Paulo',
          region: 'São Paulo',
          country: 'Brasil',
          countryCode: 'BR',
          latitude: -23.5,
          longitude: -46.6,
          timezone: 'America/Sao_Paulo',
        },
      ],
      attribution: LOCATION_ATTRIBUTION,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(logText).not.toContain('São Paulo');
    expect(logText).not.toContain('-23.5');
    expect(logText).not.toContain('-46.6');
    expect(logText).not.toContain('location-search:v1:');
  });

  it('returns an attributed empty 200 and caches it', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}', { headers: jsonHeaders }));
    app = buildApp({ fetchImpl });

    const first = await app.inject({ method: 'GET', url: '/api/v1/locations?query=Unknown' });
    const second = await app.inject({ method: 'GET', url: '/api/v1/locations?query=Unknown' });

    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ locations: [], attribution: LOCATION_ATTRIBUTION });
    expect(second.statusCode).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('keeps homonymous places distinguishable by region and country', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              id: 1,
              name: 'Springfield',
              admin1: 'Illinois',
              country: 'Estados Unidos',
              country_code: 'US',
              latitude: 39.8,
              longitude: -89.6,
              timezone: 'America/Chicago',
              feature_code: 'PPLA',
            },
            {
              id: 2,
              name: 'Springfield',
              admin1: 'Missouri',
              country: 'Estados Unidos',
              country_code: 'US',
              latitude: 37.2,
              longitude: -93.3,
              timezone: 'America/Chicago',
              feature_code: 'PPL',
            },
          ],
        }),
        { headers: jsonHeaders },
      );
    app = buildApp({ fetchImpl });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/locations?query=Springfield',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().locations).toMatchObject([
      { name: 'Springfield', region: 'Illinois', country: 'Estados Unidos' },
      { name: 'Springfield', region: 'Missouri', country: 'Estados Unidos' },
    ]);
  });

  it.each([
    '/api/v1/locations',
    '/api/v1/locations?query=ab&foo=1',
    '/api/v1/locations?query=ab&query=cd',
    '/api/v1/locations?query=%',
    '/api/v1/locations?query=a',
    `/api/v1/locations?query=${'a'.repeat(101)}`,
  ])('rejects invalid query %s before outbound work', async (url) => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}', { headers: jsonHeaders }));
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

  it('maps a stalled provider call to 503 when its timeout aborts', async () => {
    const abortController = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(abortController.signal);
    const fetchStarted = Promise.withResolvers<void>();
    const fetchImpl: typeof fetch = async () => {
      fetchStarted.resolve();
      return new Promise<Response>(() => {});
    };
    app = buildApp({ fetchImpl });

    const pending = app.inject({ method: 'GET', url: '/api/v1/locations?query=Lisboa' });
    await fetchStarted.promise;
    abortController.abort();
    const response = await pending;

    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('enforces both the 30-request location bucket and 60-request global bucket', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 8, 23, 12));
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}', { headers: jsonHeaders }));
    const testApp = buildApp({ fetchImpl });
    app = testApp;

    const locationResponses = await Promise.all(
      Array.from({ length: 30 }, () =>
        testApp.inject({ method: 'GET', url: '/api/v1/locations?query=Lisboa' }),
      ),
    );
    const groupRejected = await testApp.inject({
      method: 'GET',
      url: '/api/v1/locations?query=Lisboa',
    });
    const healthResponses = await Promise.all(
      Array.from({ length: 29 }, () => testApp.inject({ method: 'GET', url: '/health' })),
    );
    const globalRejected = await testApp.inject({ method: 'GET', url: '/health' });

    expect(locationResponses.every((response) => response.statusCode === 200)).toBe(true);
    expect(groupRejected.statusCode).toBe(429);
    expect(groupRejected.headers['x-ratelimit-limit']).toBe('30');
    expect(groupRejected.json().error.code).toBe('RATE_LIMITED');
    expect(healthResponses.every((response) => response.statusCode === 200)).toBe(true);
    expect(globalRejected.statusCode).toBe(429);
    expect(globalRejected.headers['x-ratelimit-limit']).toBe('60');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'status',
      async () => new Response('private-upstream-body', { status: 429, headers: jsonHeaders }),
    ],
    ['content_type', async () => new Response('{}', { headers: { 'content-type': 'text/plain' } })],
    ['invalid_json', async () => new Response('{', { headers: jsonHeaders })],
    ['invalid_response', async () => new Response('{"results":null}', { headers: jsonHeaders })],
    [
      'network',
      async () => {
        throw new TypeError('private upstream URL');
      },
    ],
    ['body_too_large', async () => new Response(' '.repeat(65_537), { headers: jsonHeaders })],
  ] as const)(
    'maps %s provider failure to a safe 503 and bounded correlated warning',
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
        url: '/api/v1/locations?query=Private%20City',
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
          event: 'geocoding_upstream_failed',
          requestId: response.headers['x-request-id'],
          failureKind: kind,
          ...(kind === 'status' ? { upstreamStatus: 429 } : {}),
        }),
      );
      expect(records.filter((record) => record.event === 'geocoding_upstream_failed')).toHaveLength(
        1,
      );
      expect(logText).not.toContain('Private City');
      expect(logText).not.toContain('private-upstream-body');
      expect(logText).not.toContain('203.0.113.33');
      expect(logText).not.toContain('location-search:v1:');
      expect(logText).not.toContain('geocoding-api.open-meteo.com');
      expect(
        records.every(
          (record) => Object.keys(record).filter((key) => key === 'requestId').length === 1,
        ),
      ).toBe(true);
    },
  );

  it('preserves unexpected adapter defects as safe 500 errors', async () => {
    const responseWithDefectiveStatus = new Response('{}', { headers: jsonHeaders });
    Object.defineProperty(responseWithDefectiveStatus, 'status', {
      get() {
        throw new Error('private internal defect');
      },
    });
    app = buildApp({ fetchImpl: async () => responseWithDefectiveStatus });

    const response = await app.inject({ method: 'GET', url: '/api/v1/locations?query=Lisboa' });

    expect(response.statusCode).toBe(500);
    expect(response.json().error).toMatchObject({
      code: 'INTERNAL_ERROR',
      requestId: response.headers['x-request-id'],
    });
    expect(response.body).not.toContain('private internal defect');
  });

  it('coalesces concurrent requests through the app-wide single-flight', async () => {
    const responseReady = Promise.withResolvers<Response>();
    const fetchStarted = Promise.withResolvers<void>();
    const fetchImpl = vi.fn<typeof fetch>(() => {
      fetchStarted.resolve();
      return responseReady.promise;
    });
    app = buildApp({ fetchImpl, config: parseEnvironment({ API_RATE_LIMIT_MAX: '100' }) });

    const first = app.inject({ method: 'GET', url: '/api/v1/locations?query=São%20Paulo' });
    const second = app.inject({ method: 'GET', url: '/api/v1/locations?query=Ｓão%20Paulo' });
    await fetchStarted.promise;
    responseReady.resolve(new Response('{}', { headers: jsonHeaders }));

    expect((await first).statusCode).toBe(200);
    expect((await second).statusCode).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
