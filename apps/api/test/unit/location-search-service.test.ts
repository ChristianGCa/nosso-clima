import { describe, expect, it, vi } from 'vitest';

import { createCache } from '../../src/infrastructure/cache.js';
import { createBoundedExecutor } from '../../src/infrastructure/concurrency.js';
import { createSingleFlight } from '../../src/infrastructure/single-flight.js';
import type { Location } from '../../src/locations/location-contract.js';
import { canonicalizeLocationQuery } from '../../src/locations/location-query.js';
import { createLocationSearchService } from '../../src/locations/location-search-service.js';
import {
  GeocodingFailure,
  type GeocodingFailureKind,
} from '../../src/locations/open-meteo-geocoding.js';

const place: Location = {
  id: 1,
  name: 'São Paulo',
  region: 'São Paulo',
  country: 'Brasil',
  countryCode: 'BR',
  latitude: -23.5,
  longitude: -46.6,
  timezone: 'America/Sao_Paulo',
};

function setup(search: (query: string) => Promise<readonly Location[]>, now = () => 0) {
  const cache = createCache<string, readonly Location[]>({ maxEntries: 10, now });
  const service = createLocationSearchService({
    client: { search },
    cache,
    singleFlight: createSingleFlight(),
    executor: createBoundedExecutor({ maxConcurrency: 2 }),
  });
  return { cache, service };
}

describe('location search service', () => {
  it.each([{ result: [place] }, { result: [] }])(
    'caches a validated success, including an empty result',
    async ({ result }) => {
      const clientSearch = vi.fn(async () => result);
      const { cache, service } = setup(clientSearch);
      const info = vi.fn();

      expect(await service.search('São Paulo', { info, warn: vi.fn() })).toEqual(result);
      expect(await service.search('São Paulo', { info, warn: vi.fn() })).toEqual(result);
      expect(clientSearch).toHaveBeenCalledTimes(1);
      expect(cache.size).toBe(1);
      expect(info.mock.calls.some(([bindings]) => bindings.event === 'cache_hit')).toBe(true);
      expect(JSON.stringify(info.mock.calls)).not.toContain('São Paulo');
    },
  );

  it('uses a namespaced, lowercase key and expires at 24 hours', async () => {
    let now = 0;
    const clientSearch = vi.fn(async () => [place]);
    const { cache, service } = setup(clientSearch, () => now);

    await service.search('São Paulo');
    expect(cache.get('location-search:v1:são paulo')).toEqual([place]);
    now = 86_400_000 - 1;
    expect(await service.search('São Paulo')).toEqual([place]);
    expect(clientSearch).toHaveBeenCalledTimes(1);
    now = 86_400_000;
    expect(await service.search('São Paulo')).toEqual([place]);
    expect(clientSearch).toHaveBeenCalledTimes(2);
  });

  it('rechecks the cache after becoming the single-flight owner', async () => {
    const clientSearch = vi.fn(async () => [place]);
    const { cache, service } = setup(clientSearch);

    const pending = service.search('São Paulo');
    cache.set('location-search:v1:são paulo', [place], { ttlMs: 86_400_000 });

    expect(await pending).toEqual([place]);
    expect(clientSearch).not.toHaveBeenCalled();
  });

  it('coalesces canonical-equivalent misses while distinct keys remain independent', async () => {
    const first = Promise.withResolvers<readonly Location[]>();
    const second = Promise.withResolvers<readonly Location[]>();
    const bothStarted = Promise.withResolvers<void>();
    let starts = 0;
    const clientSearch = vi.fn((query: string) => {
      starts += 1;
      if (starts === 2) bothStarted.resolve();
      return query === 'São Paulo' ? first.promise : second.promise;
    });
    const { service } = setup(clientSearch);

    const one = service.search(canonicalizeLocationQuery('  São   Paulo '));
    const duplicate = service.search(canonicalizeLocationQuery('Ｓão Paulo'));
    const other = service.search('Rio de Janeiro');
    await bothStarted.promise;
    expect(clientSearch).toHaveBeenCalledTimes(2);
    expect(clientSearch.mock.calls.map(([query]) => query)).toEqual([
      'São Paulo',
      'Rio de Janeiro',
    ]);

    first.resolve([place]);
    second.resolve([]);
    expect(await one).toEqual([place]);
    expect(await duplicate).toEqual([place]);
    expect(await other).toEqual([]);
  });

  it.each<GeocodingFailureKind>([
    'timeout',
    'network',
    'status',
    'content_type',
    'body_too_large',
    'invalid_json',
    'invalid_response',
  ])('does not cache %s failures and emits only a bounded warning', async (kind) => {
    const clientSearch = vi.fn(async () => {
      throw new GeocodingFailure(kind, kind === 'status' ? 429 : undefined);
    });
    const { cache, service } = setup(clientSearch);
    const warn = vi.fn();

    await expect(service.search('Private City', { info: vi.fn(), warn })).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
    await expect(service.search('Private City', { info: vi.fn(), warn })).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
    expect(clientSearch).toHaveBeenCalledTimes(2);
    expect(cache.size).toBe(0);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0]?.[0]).toEqual({
      event: 'geocoding_upstream_failed',
      failureKind: kind,
      ...(kind === 'status' ? { upstreamStatus: 429 } : {}),
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('Private City');
  });

  it('lets unexpected application defects propagate without misclassifying them', async () => {
    const defect = new Error('internal defect');
    const { service } = setup(async () => {
      throw defect;
    });
    const warn = vi.fn();

    await expect(service.search('São Paulo', { info: vi.fn(), warn })).rejects.toBe(defect);
    expect(warn).not.toHaveBeenCalled();
  });

  it('uses the shared executor and preserves its safe saturation error', async () => {
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<readonly Location[]>();
    const clientSearch = vi.fn(async () => {
      started.resolve();
      return release.promise;
    });
    const executor = createBoundedExecutor({ maxConcurrency: 1 });
    const service = createLocationSearchService({
      client: { search: clientSearch },
      cache: createCache<string, readonly Location[]>({ maxEntries: 10 }),
      singleFlight: createSingleFlight(),
      executor,
    });
    const warn = vi.fn();
    const logger = { info: vi.fn(), warn };

    const active = service.search('First', logger);
    await started.promise;
    const waiting = service.search('Second', logger);
    await Promise.resolve();
    await expect(service.search('Third', logger)).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
    expect(warn.mock.calls.some(([bindings]) => bindings.event === 'upstream_saturation')).toBe(
      true,
    );
    expect(clientSearch).toHaveBeenCalledTimes(1);

    release.resolve([place]);
    await active;
    await waiting;
    expect(clientSearch).toHaveBeenCalledTimes(2);
  });
});
