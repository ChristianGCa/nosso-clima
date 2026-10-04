import { forecastWithHourly as realForecast } from '../fixtures/forecast-with-hourly.js';
import { describe, expect, it, vi } from 'vitest';

import { createCache } from '../../src/infrastructure/cache.js';
import { createBoundedExecutor } from '../../src/infrastructure/concurrency.js';
import { createSingleFlight } from '../../src/infrastructure/single-flight.js';
import { ForecastFailure } from '../../src/forecast/open-meteo-forecast.js';
import { createForecastService } from '../../src/forecast/forecast-service.js';

const location = {
  latitude: -23.548,
  longitude: -46.636,
  timezone: 'America/Sao_Paulo',
} as const;

function createTestService(
  fetchImpl: () => Promise<unknown>,
  now: () => Date,
  cacheNow: () => number,
) {
  return createForecastService({
    client: { fetch: fetchImpl },
    cache: createCache({ maxEntries: 10, now: cacheNow }),
    singleFlight: createSingleFlight(),
    executor: createBoundedExecutor({ maxConcurrency: 2 }),
    now,
  });
}

describe('forecast service', () => {
  it('hits at 599,999 ms and refetches at exactly the 10-minute boundary', async () => {
    let cacheNow = 0;
    let wallNow = Date.parse('2026-09-23T23:00:00.000Z');
    let fetchCalls = 0;
    const service = createTestService(
      async () => {
        fetchCalls += 1;
        return realForecast;
      },
      () => new Date(wallNow),
      () => cacheNow,
    );

    const first = await service.get(location);
    cacheNow = 599_999;
    const beforeExpiry = await service.get(location);
    expect(beforeExpiry).toBe(first);
    expect(fetchCalls).toBe(1);

    cacheNow = 600_000;
    wallNow += 1_000;
    const atExpiry = await service.get(location);
    expect(atExpiry).not.toBe(first);
    expect(fetchCalls).toBe(2);
    expect(atExpiry.retrievedAtUtc).not.toBe(first.retrievedAtUtc);
  });

  it('coalesces concurrent misses for one rounded location key', async () => {
    let release: ((payload: unknown) => void) | undefined;
    let fetchCalls = 0;
    const pending = new Promise<unknown>((resolve) => {
      release = resolve;
    });
    const service = createTestService(
      async () => {
        fetchCalls += 1;
        return pending;
      },
      () => new Date('2026-09-23T23:00:00.000Z'),
      () => 0,
    );

    const first = service.get(location);
    const equivalent = service.get({ ...location, latitude: -23.5476, longitude: -46.6364 });
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchCalls).toBe(1);
    release?.(realForecast);
    await expect(Promise.all([first, equivalent])).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ timezone: 'America/Sao_Paulo' })]),
    );
  });

  it('does not cache provider failures and emits a bounded warning', async () => {
    const warn = vi.fn();
    let fetchCalls = 0;
    const service = createTestService(
      async () => {
        fetchCalls += 1;
        throw new ForecastFailure('network');
      },
      () => new Date('2026-09-23T23:00:00.000Z'),
      () => 0,
    );

    const logger = { info: vi.fn(), warn };
    await expect(service.get(location, logger)).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
    await expect(service.get(location, logger)).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
    expect(fetchCalls).toBe(2);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('maps a classified provider failure to safe 503 and logs only its kind/status', async () => {
    const warn = vi.fn();
    const service = createTestService(
      async () => {
        throw new ForecastFailure('status', 429);
      },
      () => new Date('2026-09-23T23:00:00.000Z'),
      () => 0,
    );

    await expect(service.get(location, { info: vi.fn(), warn })).rejects.toEqual(
      expect.objectContaining({ code: 'SERVICE_UNAVAILABLE' }),
    );
    expect(warn).toHaveBeenCalledWith(
      { event: 'forecast_upstream_failed', failureKind: 'status', upstreamStatus: 429 },
      'forecast upstream failed',
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain('23.548');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('Sao_Paulo');
  });

  it('propagates executor saturation as the platform 503 without pretending it is a provider failure', async () => {
    let releaseFirst: ((payload: unknown) => void) | undefined;
    let fetchCalls = 0;
    const firstPayload = new Promise<unknown>((resolve) => {
      releaseFirst = resolve;
    });
    const service = createForecastService({
      client: {
        fetch: async () => {
          fetchCalls += 1;
          return fetchCalls === 1 ? firstPayload : realForecast;
        },
      },
      cache: createCache({ maxEntries: 10, now: () => 0 }),
      singleFlight: createSingleFlight(),
      executor: createBoundedExecutor({ maxConcurrency: 1, maxQueueWaitMs: 5_000 }),
      now: () => new Date('2026-09-23T23:00:00.000Z'),
    });
    const logger = { info: vi.fn(), warn: vi.fn() };
    const first = service.get(location, logger);
    await Promise.resolve();
    await Promise.resolve();
    const second = service.get({ ...location, longitude: -46.635 }, logger);
    const third = service.get({ ...location, longitude: -46.634 }, logger);
    await expect(third).rejects.toEqual(expect.objectContaining({ code: 'SERVICE_UNAVAILABLE' }));
    releaseFirst?.(realForecast);
    await expect(first).resolves.toHaveProperty('daily');
    await expect(second).resolves.toHaveProperty('daily');
    expect(logger.warn).toHaveBeenCalledWith(
      { event: 'upstream_saturation' },
      'upstream concurrency saturated',
    );
  });
});
