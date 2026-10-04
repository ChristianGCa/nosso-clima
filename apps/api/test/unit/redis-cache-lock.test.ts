import { describe, expect, it, vi } from 'vitest';

import {
  ACQUIRE_CACHE_LOCK_SCRIPT,
  createRedisCache,
  READ_CACHE_SCRIPT,
  RELEASE_CACHE_LOCK_SCRIPT,
  WRITE_CACHE_SCRIPT,
} from '../../src/infrastructure/redis-cache.js';
import {
  UpstashUnavailable,
  type UpstashRestClient,
} from '../../src/infrastructure/upstash-rest.js';

function createSharedRedis() {
  let now = 0;
  const entries = new Map<string, { value: string; expiresAt: number }>();
  const locks = new Map<string, { token: string; expiresAt: number }>();
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
    if (script === ACQUIRE_CACHE_LOCK_SCRIPT) {
      const lock = locks.get(key);
      if (lock && now < lock.expiresAt) return 0;
      locks.set(key, { token: args[0] ?? '', expiresAt: now + Number(args[1]) });
      return 1;
    }
    if (script === RELEASE_CACHE_LOCK_SCRIPT) {
      if (locks.get(key)?.token !== args[0]) return 0;
      locks.delete(key);
      return 1;
    }
    throw new Error('Unexpected script');
  });
  return {
    redis: { eval: evalCommand },
    evalCommand,
    locks,
    advance: (ms: number) => (now += ms),
  };
}

function createCache(redis: UpstashRestClient, wait: (ms: number) => Promise<void>) {
  return createRedisCache<readonly string[]>({
    redis,
    namespace: 'location-search',
    secret: 'ab'.repeat(32),
    isValue: (value): value is readonly string[] =>
      Array.isArray(value) && value.every((item) => typeof item === 'string'),
    wait,
  });
}

describe('Redis cache cross-instance loading', () => {
  it('shares a concurrent miss and keeps the lock key opaque', async () => {
    const fixture = createSharedRedis();
    let releaseLoad = () => {};
    const loaded = new Promise<readonly string[]>((resolve) => {
      releaseLoad = () => resolve(['Paris']);
    });
    let releaseWait = () => {};
    const waiting = new Promise<void>((resolve) => {
      releaseWait = resolve;
    });
    const wait = vi.fn(async () => waiting);
    const first = createCache(fixture.redis, wait);
    const second = createCache(fixture.redis, wait);
    const firstLoad = vi.fn(async () => loaded);
    const secondLoad = vi.fn(async () => ['Wrong duplicate']);

    const owner = first.getOrLoad('location-search:v1:paris', 86_400_000, firstLoad);
    await vi.waitFor(() => expect(firstLoad).toHaveBeenCalledOnce());
    const follower = second.getOrLoad('location-search:v1:paris', 86_400_000, secondLoad);
    await vi.waitFor(() => expect(wait).toHaveBeenCalledOnce());
    releaseLoad();
    expect(await owner).toEqual(['Paris']);
    releaseWait();
    expect(await follower).toEqual(['Paris']);
    expect(secondLoad).not.toHaveBeenCalled();
    expect(fixture.locks.size).toBe(0);
    const lockKey = fixture.evalCommand.mock.calls.find(
      ([script]) => script === ACQUIRE_CACHE_LOCK_SCRIPT,
    )?.[1][0];
    expect(lockKey).toMatch(/^nc:cache-lock:v1:location-search:[0-9a-f]{64}$/);
    expect(lockKey).not.toContain('paris');
  });

  it('releases a failed load so another instance can retry without caching the failure', async () => {
    const fixture = createSharedRedis();
    const cache = createCache(fixture.redis, async () => {});
    await expect(
      cache.getOrLoad('city', 1000, async () => {
        throw new Error('private provider failure');
      }),
    ).rejects.toThrow('private provider failure');
    expect(fixture.locks.size).toBe(0);
    expect(await cache.getOrLoad('city', 1000, async () => ['Paris'])).toEqual(['Paris']);
  });

  it('does not release a replacement lock after the first lease expires', async () => {
    const fixture = createSharedRedis();
    let releaseFirst = () => {};
    const firstResult = new Promise<readonly string[]>((resolve) => {
      releaseFirst = () => resolve(['Old']);
    });
    let releaseSecond = () => {};
    const secondResult = new Promise<readonly string[]>((resolve) => {
      releaseSecond = () => resolve(['New']);
    });
    const first = createCache(fixture.redis, async () => {});
    const second = createCache(fixture.redis, async () => {});
    const firstLoad = vi.fn(async () => firstResult);
    const secondLoad = vi.fn(async () => secondResult);

    const owner = first.getOrLoad('city', 1000, firstLoad);
    await vi.waitFor(() => expect(firstLoad).toHaveBeenCalledOnce());
    fixture.advance(12_001);
    const replacement = second.getOrLoad('city', 1000, secondLoad);
    await vi.waitFor(() => expect(secondLoad).toHaveBeenCalledOnce());
    const replacementToken = [...fixture.locks.values()][0]?.token;
    releaseFirst();
    expect(await owner).toEqual(['Old']);
    expect([...fixture.locks.values()][0]?.token).toBe(replacementToken);
    releaseSecond();
    expect(await replacement).toEqual(['New']);
    expect(fixture.locks.size).toBe(0);
  });

  it('falls back after bounded waiting and never starts loading when Redis fails', async () => {
    const fixture = createSharedRedis();
    let releaseOwner = () => {};
    const ownerResult = new Promise<readonly string[]>((resolve) => {
      releaseOwner = () => resolve(['Owner']);
    });
    const cache = createCache(fixture.redis, async () => {});
    const ownerLoad = vi.fn(async () => ownerResult);
    const owner = cache.getOrLoad('city', 1000, ownerLoad);
    await vi.waitFor(() => expect(ownerLoad).toHaveBeenCalledOnce());
    const fallbackLoad = vi.fn(async () => ['Fallback']);
    expect(await cache.getOrLoad('city', 1000, fallbackLoad)).toEqual(['Fallback']);
    expect(fallbackLoad).toHaveBeenCalledOnce();
    releaseOwner();
    await owner;

    const failedLoad = vi.fn(async () => ['Should not run']);
    const broken = createCache(
      {
        eval: async () => {
          throw new UpstashUnavailable();
        },
      },
      async () => {},
    );
    await expect(broken.getOrLoad('other', 1000, failedLoad)).rejects.toEqual(
      new UpstashUnavailable(),
    );
    expect(failedLoad).not.toHaveBeenCalled();
  });
});
