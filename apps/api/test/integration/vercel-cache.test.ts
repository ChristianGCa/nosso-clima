import { Writable } from 'node:stream';

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../src/backend-app.js';
import {
  ACQUIRE_CACHE_LOCK_SCRIPT,
  READ_CACHE_SCRIPT,
  RELEASE_CACHE_LOCK_SCRIPT,
  WRITE_CACHE_SCRIPT,
} from '../../src/infrastructure/redis-cache.js';
import { RESERVE_QUOTA_SCRIPT } from '../../src/infrastructure/quota-reservation.js';
import { SHARED_VISITOR_LIMIT_SCRIPT } from '../../src/infrastructure/shared-visitor-limit.js';
import type { UpstashRestClient } from '../../src/infrastructure/upstash-rest.js';
import { CHECK_CIRCUIT_SCRIPT } from '../../src/infrastructure/upstream-circuit.js';
import { createVercelApp } from '../../src/vercel-app.js';
import { forecastWithHourly } from '../fixtures/forecast-with-hourly.js';

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
const headers = { 'x-vercel-forwarded-for': '203.0.113.10' };
const locationUrl = '/api/v1/locations?query=Paris';
const forecastUrl =
  '/api/v1/forecast?latitude=-23.548&longitude=-46.636&timezone=America%2FSao_Paulo';

function createRedisFixture() {
  let now = 0;
  let unavailable = false;
  const entries = new Map<string, { value: string; expiresAt: number }>();
  const locks = new Map<string, string>();
  const commands: string[] = [];
  const redis: UpstashRestClient = {
    async eval(script, keys, args) {
      if (script === SHARED_VISITOR_LIMIT_SCRIPT) return [1, 60_000, 59];
      if (unavailable) throw new Error('private Redis failure');
      if (script === CHECK_CIRCUIT_SCRIPT) return 1;
      if (script === RESERVE_QUOTA_SCRIPT) {
        commands.push(`reserve:${args[0]}`);
        return 1;
      }
      const key = keys[0];
      if (!key) throw new Error('Missing cache key');
      if (script === READ_CACHE_SCRIPT) {
        const entry = entries.get(key);
        return entry && now < entry.expiresAt ? entry.value : null;
      }
      if (script === WRITE_CACHE_SCRIPT) {
        entries.set(key, { value: args[0] ?? '', expiresAt: now + Number(args[1]) });
        return 'OK';
      }
      if (script === ACQUIRE_CACHE_LOCK_SCRIPT) {
        if (locks.has(key)) return 0;
        locks.set(key, args[0] ?? '');
        return 1;
      }
      if (script === RELEASE_CACHE_LOCK_SCRIPT) {
        if (locks.get(key) !== args[0]) return 0;
        locks.delete(key);
        return 1;
      }
      throw new Error('Unexpected Redis command');
    },
  };
  return {
    redis,
    entries,
    commands,
    advance: (ms: number) => (now += ms),
    setUnavailable: (value: boolean) => (unavailable = value),
  };
}

const places = [
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
];

function providerResponse(input: Parameters<typeof fetch>[0]): Response {
  return new Response(
    JSON.stringify(
      String(input).includes('geocoding-api') ? { results: places } : forecastWithHourly,
    ),
    { headers: { 'content-type': 'application/json' } },
  );
}

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('Vercel route cache integration', () => {
  it('preserves the local HTTP response contracts for both fixture-backed routes', async () => {
    const fixture = createRedisFixture();
    const providerFetch = vi.fn<typeof fetch>(async (input) => providerResponse(input));
    const local = buildApp({ fetchImpl: providerFetch });
    const deployed = createVercelApp(environment, { redis: fixture.redis, providerFetch });
    apps.push(local, deployed);

    const localLocations = await local.inject({ method: 'GET', url: locationUrl });
    const deployedLocations = await deployed.inject({ method: 'GET', url: locationUrl, headers });
    const localForecast = await local.inject({ method: 'GET', url: forecastUrl });
    const deployedForecast = await deployed.inject({ method: 'GET', url: forecastUrl, headers });

    expect(deployedLocations.statusCode).toBe(localLocations.statusCode);
    expect(deployedLocations.json()).toEqual(localLocations.json());
    expect(deployedForecast.statusCode).toBe(localForecast.statusCode);
    expect(deployedForecast.json()).toEqual({
      ...localForecast.json(),
      retrievedAtUtc: expect.any(String),
    });
    expect(deployedForecast.json().retrievedAtUtc).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(deployedLocations.headers['x-request-id']).toEqual(expect.any(String));
    expect(deployedForecast.headers['x-request-id']).toEqual(expect.any(String));
    expect(fixture.commands).toEqual(['reserve:1000', 'reserve:2000']);
  });

  it('shares exact route bodies across instances, then reloads at each exact TTL', async () => {
    const fixture = createRedisFixture();
    const providerFetch = vi.fn<typeof fetch>(async (input) => providerResponse(input));
    const first = createVercelApp(environment, { redis: fixture.redis, providerFetch });
    const second = createVercelApp(environment, { redis: fixture.redis, providerFetch });
    apps.push(first, second);

    const firstLocations = await first.inject({ method: 'GET', url: locationUrl, headers });
    const firstForecast = await first.inject({ method: 'GET', url: forecastUrl, headers });
    const cachedLocations = await second.inject({ method: 'GET', url: locationUrl, headers });
    const cachedForecast = await second.inject({ method: 'GET', url: forecastUrl, headers });

    expect(firstLocations.statusCode).toBe(200);
    expect(firstForecast.statusCode).toBe(200);
    expect(cachedLocations.json()).toEqual(firstLocations.json());
    expect(cachedForecast.json()).toEqual(firstForecast.json());
    expect(cachedForecast.json().retrievedAtUtc).toBe(firstForecast.json().retrievedAtUtc);
    expect(providerFetch).toHaveBeenCalledTimes(2);
    expect(fixture.commands).toEqual(['reserve:1000', 'reserve:2000']);
    for (const key of fixture.entries.keys()) {
      expect(key).toMatch(/^nc:cache:v1:(location-search|weather-forecast):[0-9a-f]{64}$/);
      expect(key).not.toContain('Paris');
      expect(key).not.toContain('Sao_Paulo');
    }

    fixture.advance(600_000);
    expect((await second.inject({ method: 'GET', url: locationUrl, headers })).json()).toEqual(
      firstLocations.json(),
    );
    expect((await second.inject({ method: 'GET', url: forecastUrl, headers })).statusCode).toBe(
      200,
    );
    expect(providerFetch).toHaveBeenCalledTimes(3);
    fixture.advance(85_800_000);
    expect((await second.inject({ method: 'GET', url: locationUrl, headers })).statusCode).toBe(
      200,
    );
    expect(providerFetch).toHaveBeenCalledTimes(4);
  });

  it('fails closed on Redis failure or invalid cached values without exposing private data', async () => {
    const fixture = createRedisFixture();
    const providerFetch = vi.fn<typeof fetch>(async (input) => providerResponse(input));
    let logText = '';
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        logText += String(chunk);
        callback();
      },
    });
    const app = createVercelApp(
      { ...environment, LOG_LEVEL: 'info' },
      {
        redis: fixture.redis,
        providerFetch,
        loggerStream: stream,
      },
    );
    apps.push(app);

    expect((await app.inject({ method: 'GET', url: locationUrl, headers })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: forecastUrl, headers })).statusCode).toBe(200);
    for (const [key, entry] of fixture.entries) {
      fixture.entries.set(key, { ...entry, value: JSON.stringify({ private: 'bad cache' }) });
    }
    const badLocation = await app.inject({ method: 'GET', url: locationUrl, headers });
    const badForecast = await app.inject({ method: 'GET', url: forecastUrl, headers });
    expect(badLocation.statusCode).toBe(503);
    expect(badForecast.statusCode).toBe(503);
    expect(providerFetch).toHaveBeenCalledTimes(2);
    fixture.setUnavailable(true);
    expect((await app.inject({ method: 'GET', url: locationUrl, headers })).statusCode).toBe(503);
    expect((await app.inject({ method: 'GET', url: forecastUrl, headers })).statusCode).toBe(503);
    expect(providerFetch).toHaveBeenCalledTimes(2);
    expect(logText).not.toContain('Paris');
    expect(logText).not.toContain('Sao_Paulo');
    expect(logText).not.toContain('bad cache');
    expect(logText).not.toContain('203.0.113.10');
  });

  it('does not cache provider failures and shares a valid empty locations result', async () => {
    const fixture = createRedisFixture();
    let fail = true;
    const providerFetch = vi.fn<typeof fetch>(async (input) => {
      if (fail) return new Response('private upstream failure', { status: 503 });
      return String(input).includes('geocoding-api')
        ? new Response('{}', { headers: { 'content-type': 'application/json' } })
        : providerResponse(input);
    });
    const first = createVercelApp(environment, { redis: fixture.redis, providerFetch });
    const second = createVercelApp(environment, { redis: fixture.redis, providerFetch });
    apps.push(first, second);

    const failedLocations = await first.inject({ method: 'GET', url: locationUrl, headers });
    const failedForecast = await first.inject({ method: 'GET', url: forecastUrl, headers });
    expect(failedLocations.statusCode).toBe(503);
    expect(failedForecast.statusCode).toBe(503);
    expect(fixture.entries.size).toBe(0);

    fail = false;
    const locations = await second.inject({ method: 'GET', url: locationUrl, headers });
    const forecast = await second.inject({ method: 'GET', url: forecastUrl, headers });
    expect(locations.statusCode).toBe(200);
    expect(locations.json().locations).toEqual([]);
    expect(forecast.statusCode).toBe(200);
    expect(fixture.entries.size).toBe(2);
    expect((await first.inject({ method: 'GET', url: locationUrl, headers })).json()).toEqual(
      locations.json(),
    );
    expect((await first.inject({ method: 'GET', url: forecastUrl, headers })).json()).toEqual(
      forecast.json(),
    );
    expect(providerFetch).toHaveBeenCalledTimes(4);
  });
});
