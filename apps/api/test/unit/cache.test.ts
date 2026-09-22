import { describe, expect, it } from 'vitest';

import { createCache } from '../../src/infrastructure/cache.js';

describe('createCache', () => {
  it('stores values with independent TTLs and reports its size', () => {
    let now = 0;
    const cache = createCache<string, number>({ maxEntries: 2, now: () => now });

    cache.set('short-lived', 1, { ttlMs: 100 });
    cache.set('long-lived', 2, { ttlMs: 200 });

    expect(cache.get('missing')).toBeUndefined();
    expect(cache.get('short-lived')).toBe(1);
    expect(cache.get('long-lived')).toBe(2);
    expect(cache.size).toBe(2);

    now = 101;

    expect(cache.get('short-lived')).toBeUndefined();
    expect(cache.get('long-lived')).toBe(2);
    expect(cache.size).toBe(1);
  });

  it('evicts the least-recently-used value at the configured bound', () => {
    const cache = createCache<string, number>({ maxEntries: 2 });

    cache.set('first', 1, { ttlMs: 1_000 });
    cache.set('second', 2, { ttlMs: 1_000 });
    expect(cache.get('first')).toBe(1);

    cache.set('third', 3, { ttlMs: 1_000 });

    expect(cache.get('first')).toBe(1);
    expect(cache.get('second')).toBeUndefined();
    expect(cache.get('third')).toBe(3);
    expect(cache.size).toBe(2);
  });

  it('deletes individual values and clears all values', () => {
    const cache = createCache<string, number>({ maxEntries: 2 });
    cache.set('first', 1, { ttlMs: 1_000 });
    cache.set('second', 2, { ttlMs: 1_000 });

    expect(cache.delete('first')).toBe(true);
    expect(cache.delete('first')).toBe(false);
    expect(cache.size).toBe(1);

    cache.clear();

    expect(cache.get('second')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it.each([0, -1, 1.5, Number.POSITIVE_INFINITY, Number.NaN])(
    'rejects an invalid maximum entry count: %s',
    (maxEntries) => {
      expect(() => createCache({ maxEntries })).toThrow(/maxEntries/);
    },
  );

  it.each([0, -1, Number.POSITIVE_INFINITY, Number.NaN])('rejects an invalid TTL: %s', (ttlMs) => {
    const cache = createCache<string, number>({ maxEntries: 1 });

    expect(() => cache.set('value', 1, { ttlMs })).toThrow(/ttlMs/);
  });
});
