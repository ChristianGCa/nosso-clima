import { describe, expect, it } from 'vitest';

import { createVisitorPreLimit } from '../../src/infrastructure/visitor-pre-limit.js';
import type { VisitorIdentity } from '../../src/infrastructure/visitor-identity.js';

const visitor = (digest: string, bucket = 1): VisitorIdentity => ({ digest, bucket });

describe('bounded visitor pre-limit', () => {
  it('allows 60 global requests in a minute and rejects the next', () => {
    const limit = createVisitorPreLimit();
    for (let index = 0; index < 60; index += 1) {
      expect(limit.check(visitor('a'))).toBe(true);
    }
    expect(limit.check(visitor('a'))).toBe(false);
    expect(limit.check(visitor('b'))).toBe(true);
    expect(limit.check(visitor('a', 2))).toBe(true);
  });

  it('keeps location and forecast groups independent without partial increments', () => {
    const limit = createVisitorPreLimit();
    for (let index = 0; index < 30; index += 1) {
      expect(limit.check(visitor('a'), 'location-search')).toBe(true);
    }
    expect(limit.check(visitor('a'), 'location-search')).toBe(false);
    for (let index = 0; index < 15; index += 1) {
      expect(limit.check(visitor('a'), 'weather-forecast')).toBe(true);
    }
    expect(limit.check(visitor('a'), 'weather-forecast')).toBe(false);
    for (let index = 0; index < 15; index += 1) {
      expect(limit.check(visitor('a'))).toBe(true);
    }
    expect(limit.check(visitor('a'))).toBe(false);
  });

  it('caps state and rejects new identities until the minute changes', () => {
    const limit = createVisitorPreLimit({ maxEntries: 2 });
    expect(limit.check(visitor('a'))).toBe(true);
    expect(limit.check(visitor('b'))).toBe(true);
    expect(limit.size).toBe(2);
    expect(limit.check(visitor('c'))).toBe(false);
    expect(limit.size).toBe(2);
    expect(limit.check(visitor('c', 2))).toBe(true);
    expect(limit.size).toBe(1);
  });

  it('rejects invalid capacity at construction', () => {
    expect(() => createVisitorPreLimit({ maxEntries: 0 })).toThrow();
  });
});
