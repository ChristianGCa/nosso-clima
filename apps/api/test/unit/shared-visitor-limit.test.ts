import { describe, expect, it, vi } from 'vitest';

import {
  createSharedVisitorLimit,
  SHARED_VISITOR_LIMIT_SCRIPT,
} from '../../src/infrastructure/shared-visitor-limit.js';
import { createVisitorIdentity } from '../../src/infrastructure/visitor-identity.js';
import type { UpstashRestClient } from '../../src/infrastructure/upstash-rest.js';
import { UpstashUnavailable } from '../../src/infrastructure/upstash-rest.js';

const secret = 'ab'.repeat(32);

function createRedisFixture() {
  let now = 60_000;
  const counters = new Map<string, { count: number; expiresAt: number }>();
  const evalCommand = vi.fn<UpstashRestClient['eval']>(async (script, keys, args) => {
    if (script !== SHARED_VISITOR_LIMIT_SCRIPT) throw new Error('Unexpected script');
    const requestBucket = Number(args[0]);
    const redisBucket = Math.floor(now / 60_000);
    const offset = redisBucket - requestBucket;
    if (Math.abs(offset) > 1) return [3, 0, 0];
    const index = (offset + 1) * 2;
    const globalKey = keys[index];
    const groupKey = keys[index + 1];
    if (!globalKey || !groupKey) throw new Error('Missing key');
    const current = (key: string) => {
      const entry = counters.get(key);
      return entry && now < entry.expiresAt ? entry.count : 0;
    };
    const global = current(globalKey);
    const group = current(groupKey);
    const remainingMs = (redisBucket + 1) * 60_000 - now;
    if (global >= 60) return [0, remainingMs, 0];
    if (Number(args[1]) > 0 && group >= Number(args[1])) return [2, remainingMs, 0];
    counters.set(globalKey, { count: global + 1, expiresAt: now + remainingMs });
    if (Number(args[1]) > 0) {
      counters.set(groupKey, { count: group + 1, expiresAt: now + remainingMs });
    }
    return [1, remainingMs, 60 - global - 1];
  });
  return {
    redis: { eval: evalCommand },
    evalCommand,
    counters,
    get now() {
      return now;
    },
    set now(value: number) {
      now = value;
    },
  };
}

describe('shared visitor limit', () => {
  it('enforces 60/min globally across instances with opaque one-minute keys', async () => {
    const fixture = createRedisFixture();
    const identify = createVisitorIdentity(secret, () => fixture.now);
    const first = createSharedVisitorLimit(fixture.redis);
    const second = createSharedVisitorLimit(fixture.redis);
    const identity = identify('203.0.113.10');

    const decisions = await Promise.all(
      Array.from({ length: 60 }, (_, index) => (index % 2 ? first : second).check(identity)),
    );
    expect(decisions.every((decision) => decision.kind === 'allowed')).toBe(true);
    expect(await first.check(identity)).toEqual({
      kind: 'rejected',
      scope: 'global',
      retryAfter: 60,
    });
    expect(fixture.counters.size).toBe(1);
    for (const key of fixture.counters.keys()) {
      expect(key).toMatch(/^nc:visitor-limit:v1:\{[0-9a-f]{64}\}:global$/);
      expect(key).not.toContain('203.0.113.10');
    }
    expect(
      fixture.evalCommand.mock.calls.every(
        ([, keys, args]) => !JSON.stringify([keys, args]).includes('203.0.113.10'),
      ),
    ).toBe(true);
  });

  it('enforces independent group budgets without consuming denied counters', async () => {
    const fixture = createRedisFixture();
    const identify = createVisitorIdentity(secret, () => fixture.now);
    const limit = createSharedVisitorLimit(fixture.redis);
    const identity = identify('203.0.113.10');

    for (let index = 0; index < 30; index += 1) {
      expect((await limit.check(identity, 'location-search')).kind).toBe('allowed');
    }
    expect(await limit.check(identity, 'location-search')).toMatchObject({
      kind: 'rejected',
      scope: 'location-search',
    });
    for (let index = 0; index < 15; index += 1) {
      expect((await limit.check(identity, 'weather-forecast')).kind).toBe('allowed');
    }
    expect(await limit.check(identity, 'weather-forecast')).toMatchObject({
      kind: 'rejected',
      scope: 'weather-forecast',
    });
    for (let index = 0; index < 15; index += 1) {
      expect((await limit.check(identity)).kind).toBe('allowed');
    }
    expect(await limit.check(identity)).toMatchObject({ kind: 'rejected', scope: 'global' });
  });

  it('expires counters at the exact minute boundary and rotates the digest', async () => {
    const fixture = createRedisFixture();
    const identify = createVisitorIdentity(secret, () => fixture.now);
    const limit = createSharedVisitorLimit(fixture.redis);
    fixture.now = 119_999;
    const before = identify('203.0.113.10');
    expect(await limit.check(before)).toEqual({ kind: 'allowed' });
    const oldKey = [...fixture.counters.keys()][0];
    expect(fixture.counters.get(oldKey ?? '')?.expiresAt).toBe(120_000);

    fixture.now = 120_000;
    const after = identify('203.0.113.10');
    expect(after.digest).not.toBe(before.digest);
    expect(await limit.check(after)).toEqual({ kind: 'allowed' });
    expect([...fixture.counters.keys()][1]).not.toBe(oldKey);
  });

  it('fails closed on Redis failure, unexpected result and clock skew', async () => {
    const fixture = createRedisFixture();
    const identify = createVisitorIdentity(secret, () => fixture.now);
    const identity = identify('203.0.113.10');
    const broken = createSharedVisitorLimit({
      eval: async () => {
        throw new Error('private');
      },
    });
    await expect(broken.check(identity)).rejects.toEqual(new UpstashUnavailable());
    const malformed = createSharedVisitorLimit({ eval: async () => [9] });
    await expect(malformed.check(identity)).rejects.toEqual(new UpstashUnavailable());
    fixture.now = 240_000;
    const skewed = createSharedVisitorLimit(fixture.redis);
    await expect(skewed.check(identity)).rejects.toEqual(new UpstashUnavailable());
  });
});
