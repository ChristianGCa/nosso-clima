import { describe, expect, it } from 'vitest';

import { parseProviderPolicy } from '../../src/config/provider-policy.js';

const valid = {
  OPEN_METEO_MINUTE_CREDITS: '10000',
  OPEN_METEO_HOUR_CREDITS: '50000',
  OPEN_METEO_DAY_CREDITS: '100000',
  OPEN_METEO_MONTH_CREDITS: '200000',
  OPEN_METEO_GEOCODING_CREDITS: '1000',
  OPEN_METEO_FORECAST_CREDITS: '2000',
  OPEN_METEO_429_COOLDOWN_MS: '60000',
  OPEN_METEO_PROBE_MS: '10000',
};

describe('provider policy configuration', () => {
  it('uses conservative defaults only for missing Preview values', () => {
    expect(parseProviderPolicy({ VERCEL_ENV: 'preview' })).toEqual({
      limits: { minute: 1000, hour: 1000, day: 1000, month: 1000 },
      costs: { geocoding: 1000, forecast: 1000 },
      circuit: { cooldownMs: 60000, probeMs: 10000 },
    });
    expect(
      parseProviderPolicy({
        VERCEL_ENV: 'preview',
        ...valid,
      }),
    ).toEqual(parseProviderPolicy(valid));
  });

  it('still requires explicit policy outside Preview', () => {
    for (const vercelEnv of [undefined, 'production', 'development']) {
      expect(() => parseProviderPolicy({ VERCEL_ENV: vercelEnv })).toThrow();
    }
  });

  it('rejects an invalid explicit Preview value', () => {
    expect(() =>
      parseProviderPolicy({ VERCEL_ENV: 'preview', OPEN_METEO_MONTH_CREDITS: '0' }),
    ).toThrow();
  });

  it('accepts explicit integer credits and timing', () => {
    expect(parseProviderPolicy(valid)).toEqual({
      limits: { minute: 10000, hour: 50000, day: 100000, month: 200000 },
      costs: { geocoding: 1000, forecast: 2000 },
      circuit: { cooldownMs: 60000, probeMs: 10000 },
    });
  });

  it.each([
    ['missing cap', { OPEN_METEO_MINUTE_CREDITS: undefined }],
    ['zero cap', { OPEN_METEO_MINUTE_CREDITS: '0' }],
    ['fractional cap', { OPEN_METEO_MINUTE_CREDITS: '1.5' }],
    ['whitespace cap', { OPEN_METEO_MINUTE_CREDITS: ' 10000' }],
    ['unsafe cap', { OPEN_METEO_MINUTE_CREDITS: '9007199254740992' }],
    ['provider cap exceeded', { OPEN_METEO_MINUTE_CREDITS: '600000' }],
    ['sub-call geocoding cost', { OPEN_METEO_GEOCODING_CREDITS: '999' }],
    ['cost above minute cap', { OPEN_METEO_FORECAST_CREDITS: '10001' }],
    ['missing cooldown', { OPEN_METEO_429_COOLDOWN_MS: undefined }],
    ['zero probe', { OPEN_METEO_PROBE_MS: '0' }],
  ])('rejects %s', (_case, patch) => {
    expect(() => parseProviderPolicy({ ...valid, ...patch })).toThrow();
  });
});
