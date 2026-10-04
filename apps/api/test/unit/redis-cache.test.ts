import { describe, expect, it, vi } from 'vitest';

import {
  createRedisCache,
  READ_CACHE_SCRIPT,
  WRITE_CACHE_SCRIPT,
} from '../../src/infrastructure/redis-cache.js';
import {
  UpstashUnavailable,
  type UpstashRestClient,
} from '../../src/infrastructure/upstash-rest.js';

function createRedisFixture() {
  let now = 0;
  const entries = new Map<string, { value: string; expiresAt: number }>();
  const evalCommand = vi.fn<UpstashRestClient['eval']>(async (script, keys, args) => {
    const key = keys[0];
    if (!key) throw new Error('Missing key');
    if (script === READ_CACHE_SCRIPT) {
      const entry = entries.get(key);
      return entry && now < entry.expiresAt ? entry.value : null;
    }
    if (script === WRITE_CACHE_SCRIPT) {
      entries.set(key, { value: args[0] ?? '', expiresAt: now + Number(args[1]) });
      return 'OK';
    }
    throw new Error('Unexpected script');
  });
  return {
    redis: { eval: evalCommand },
    evalCommand,
    entries,
    advance: (ms: number) => (now += ms),
  };
}

function createLocationsCache(redis: UpstashRestClient) {
  return createRedisCache<readonly string[]>({
    redis,
    namespace: 'location-search',
    secret: 'ab'.repeat(32),
    isValue: (value): value is readonly string[] =>
      Array.isArray(value) && value.every((item) => typeof item === 'string'),
  });
}

describe('Redis cache', () => {
  it('shares positive and empty hits across instances with opaque versioned keys', async () => {
    const fixture = createRedisFixture();
    const first = createLocationsCache(fixture.redis);
    const second = createLocationsCache(fixture.redis);
    const logger = { info: vi.fn() };

    await first.set('location-search:v1:são paulo', ['São Paulo'], { ttlMs: 86_400_000 });
    await first.set('location-search:v1:sem resultado', [], { ttlMs: 86_400_000 });
    expect(await second.get('location-search:v1:são paulo', logger)).toEqual(['São Paulo']);
    expect(await second.get('location-search:v1:sem resultado', logger)).toEqual([]);
    expect(logger.info).toHaveBeenCalledWith({ event: 'cache_hit' }, 'cache hit');

    for (const key of fixture.entries.keys()) {
      expect(key).toMatch(/^nc:cache:v1:location-search:[0-9a-f]{64}$/);
      expect(key).not.toContain('são paulo');
      expect(key).not.toContain('sem resultado');
    }
  });

  it('expires at the exact TTL boundary and rejects a longer retention', async () => {
    const fixture = createRedisFixture();
    const cache = createLocationsCache(fixture.redis);
    await cache.set('city', ['Paris'], { ttlMs: 86_400_000 });

    fixture.advance(86_399_999);
    expect(await cache.get('city')).toEqual(['Paris']);
    fixture.advance(1);
    expect(await cache.get('city')).toBeUndefined();
    await expect(cache.set('city', ['Paris'], { ttlMs: 86_400_001 })).rejects.toThrow();
    await expect(cache.set('city', ['Paris'], { ttlMs: 0 })).rejects.toThrow();
  });

  it('limits forecast entries to ten minutes and validates values before storing', async () => {
    const fixture = createRedisFixture();
    const cache = createRedisCache<{ retrievedAtUtc: string }>({
      redis: fixture.redis,
      namespace: 'weather-forecast',
      secret: 'ab'.repeat(32),
      isValue: (value): value is { retrievedAtUtc: string } =>
        typeof value === 'object' &&
        value !== null &&
        'retrievedAtUtc' in value &&
        typeof value.retrievedAtUtc === 'string',
    });
    await cache.set(
      'coordinates-and-zone',
      { retrievedAtUtc: '2026-10-04T00:00:00.000Z' },
      {
        ttlMs: 600_000,
      },
    );
    expect(await cache.get('coordinates-and-zone')).toEqual({
      retrievedAtUtc: '2026-10-04T00:00:00.000Z',
    });
    await expect(
      cache.set('coordinates-and-zone', { retrievedAtUtc: 'x' }, { ttlMs: 600_001 }),
    ).rejects.toThrow();
    await expect(
      cache.set('coordinates-and-zone', {} as { retrievedAtUtc: string }, { ttlMs: 600_000 }),
    ).rejects.toThrow();
    await cache.set(
      'coordinates-and-zone',
      { retrievedAtUtc: 'x'.repeat(5000) },
      {
        ttlMs: 600_000,
      },
    );
    expect((await cache.get('coordinates-and-zone'))?.retrievedAtUtc).toHaveLength(5000);
    await expect(
      cache.set('coordinates-and-zone', { retrievedAtUtc: 'x'.repeat(24_577) }, { ttlMs: 600_000 }),
    ).rejects.toThrow();
  });

  it('fails closed on malformed stored values and Redis errors', async () => {
    const fixture = createRedisFixture();
    const cache = createLocationsCache(fixture.redis);
    await cache.set('city', ['Paris'], { ttlMs: 1000 });
    const [key] = fixture.entries.keys();
    if (!key) throw new Error('Missing fixture key');
    fixture.entries.set(key, { value: '{', expiresAt: 1000 });
    await expect(cache.get('city')).rejects.toEqual(new UpstashUnavailable());
    fixture.entries.set(key, { value: JSON.stringify({ raw: 'query' }), expiresAt: 1000 });
    await expect(cache.get('city')).rejects.toEqual(new UpstashUnavailable());

    const broken = createLocationsCache({ eval: async () => 1 });
    await expect(broken.get('city')).rejects.toEqual(new UpstashUnavailable());
    await expect(broken.set('city', ['Paris'], { ttlMs: 1000 })).rejects.toEqual(
      new UpstashUnavailable(),
    );
  });

  it('rejects an invalid key-derivation secret before any Redis command', () => {
    const fixture = createRedisFixture();
    expect(() =>
      createRedisCache({
        redis: fixture.redis,
        namespace: 'location-search',
        secret: 'too-short',
        isValue: (value): value is string => typeof value === 'string',
      }),
    ).toThrow('Invalid cache secret');
    expect(fixture.evalCommand).not.toHaveBeenCalled();
  });
});
