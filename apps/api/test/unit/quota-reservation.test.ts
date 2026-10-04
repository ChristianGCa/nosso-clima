import { describe, expect, it } from 'vitest';

import {
  createQuotaReservation,
  type QuotaLimits,
} from '../../src/infrastructure/quota-reservation.js';
import {
  UpstashUnavailable,
  type UpstashRestClient,
} from '../../src/infrastructure/upstash-rest.js';

const limits: QuotaLimits = { minute: 10, hour: 50, day: 100, month: 200 };

describe('weighted quota reservation', () => {
  it('uses a single EVAL for all four rolling windows and a weighted cost', async () => {
    const calls: Array<{ script: string; keys: readonly string[]; args: readonly string[] }> = [];
    const redis: UpstashRestClient = {
      async eval(script, keys, args) {
        calls.push({ script, keys, args });
        return 1;
      },
    };
    const reservation = createQuotaReservation(redis, limits);

    await expect(reservation.reserve(3)).resolves.toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.keys).toEqual([
      'nc:quota:v1:{open-meteo}:events',
      'nc:quota:v1:{open-meteo}:base',
    ]);
    expect(calls[0]?.args).toEqual(['3', '10', '50', '100', '200']);
    expect(calls[0]?.script).toContain("redis.call('TIME')");
  });

  it('returns denial only for the script denial result', async () => {
    const redis: UpstashRestClient = { eval: async () => 0 };
    await expect(createQuotaReservation(redis, limits).reserve(1)).resolves.toBe(false);
  });

  it.each([null, '1', 2, [], { result: 1 }])(
    'fails closed for unexpected result %j',
    async (result) => {
      const redis: UpstashRestClient = { eval: async () => result };
      await expect(createQuotaReservation(redis, limits).reserve(1)).rejects.toEqual(
        new UpstashUnavailable(),
      );
    },
  );

  it('propagates Redis failure and rejects invalid costs and policy', async () => {
    const redis: UpstashRestClient = {
      eval: async () => {
        throw new UpstashUnavailable();
      },
    };
    const reservation = createQuotaReservation(redis, limits);
    await expect(reservation.reserve(1)).rejects.toEqual(new UpstashUnavailable());
    await expect(reservation.reserve(0)).rejects.toThrow(/^Invalid reservation cost$/);
    await expect(reservation.reserve(1.5)).rejects.toThrow(/^Invalid reservation cost$/);
    expect(() => createQuotaReservation(redis, { ...limits, day: 0 })).toThrow(
      /^Invalid quota limits$/,
    );
  });
});
