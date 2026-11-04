import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';

import {
  FORECAST_ATTRIBUTION,
  ForecastResponseSchema,
} from '../../src/forecast/forecast-contract.js';
import { forecastCacheKey, parseForecastQuery } from '../../src/forecast/forecast-query.js';
import { MAX_CACHE_VALUE_BYTES } from '../../src/infrastructure/redis-cache.js';

const query = (parameters: string) => `/api/v1/forecast?${parameters}`;

describe('forecast query boundary', () => {
  it('rounds coordinates to three decimals before forming the key', () => {
    const first = parseForecastQuery(
      query('latitude=-23.5475&longitude=-46.63611&timezone=America%2FSao_Paulo'),
    );
    const equivalent = parseForecastQuery(
      query('latitude=-23.5480&longitude=-46.6364&timezone=America%2FSao_Paulo'),
    );
    expect(first).toEqual({ latitude: -23.548, longitude: -46.636, timezone: 'America/Sao_Paulo' });
    expect(forecastCacheKey(first)).toBe(forecastCacheKey(equivalent));
  });

  it('rounds exact halfway cases away from zero and normalizes negative zero', () => {
    expect(parseForecastQuery(query('latitude=1.0625&longitude=-1.0625&timezone=UTC'))).toEqual({
      latitude: 1.063,
      longitude: -1.063,
      timezone: 'UTC',
    });
    expect(parseForecastQuery(query('latitude=-0&longitude=-0.0001&timezone=UTC'))).toEqual({
      latitude: 0,
      longitude: 0,
      timezone: 'UTC',
    });
  });

  it('accepts a leading decimal point and signed exponent notation', () => {
    expect(parseForecastQuery(query('latitude=.0005&longitude=%2B1.25e0&timezone=UTC'))).toEqual({
      latitude: 0.001,
      longitude: 1.25,
      timezone: 'UTC',
    });
  });

  it('validates original bounds before rounding', () => {
    expect(() => parseForecastQuery(query('latitude=90.0001&longitude=0&timezone=UTC'))).toThrow();
    expect(() =>
      parseForecastQuery(query('latitude=0&longitude=-180.0001&timezone=UTC')),
    ).toThrow();
    expect(parseForecastQuery(query('latitude=90&longitude=-180&timezone=UTC'))).toEqual({
      latitude: 90,
      longitude: -180,
      timezone: 'UTC',
    });
  });

  it('resolves accepted IANA aliases to one canonical cache key', () => {
    const alias = parseForecastQuery(query('latitude=0&longitude=0&timezone=US%2FEastern'));
    const canonical = parseForecastQuery(
      query('latitude=0&longitude=0&timezone=America%2FNew_York'),
    );
    expect(alias.timezone).toBe('America/New_York');
    expect(forecastCacheKey(alias)).toBe(forecastCacheKey(canonical));
  });

  it.each([
    undefined,
    '/api/v1/forecast',
    query('latitude=0&longitude=0'),
    query('latitude=0&longitude=0&timezone=UTC&foo=1'),
    query('latitude=0&longitude=0&foo=1'),
    query('latitude=0&latitude=1&longitude=0&timezone=UTC'),
    query('latitude=0&latitude=1&longitude=0'),
    query('latitude=NaN&longitude=0&timezone=UTC'),
    query('latitude=&longitude=0&timezone=UTC'),
    query('latitude=123456789012345678901234567890123&longitude=0&timezone=UTC'),
    query('latitude=1e999&longitude=0&timezone=UTC'),
    query('latitude=91&longitude=0&timezone=UTC'),
    query('latitude=0&longitude=181&timezone=UTC'),
    query('latitude=0&longitude=0&timezone=%2B03%3A00'),
    query('latitude=0&longitude=0&timezone=Not%2FA_Zone'),
    query('latitude=0&longitude=0&timezone=UTC%00'),
    query('latitude=0&longitude=0&timezone=UTC%ZZ'),
  ])('rejects invalid parameters without echoing input: %s', (url) => {
    expect(() => parseForecastQuery(url)).toThrowError('Invalid request');
  });
});

describe('forecast cache key', () => {
  it('uses the v2 namespace so values from the previous contract are never read', () => {
    const key = forecastCacheKey({
      latitude: -23.548,
      longitude: -46.636,
      timezone: 'America/Sao_Paulo',
    });
    expect(key).toBe('weather-forecast:v2:-23.548:-46.636:America/Sao_Paulo');
  });
});

describe('forecast response contract', () => {
  const day = {
    date: '2026-09-23',
    temperatureMaxC: 27.5,
    temperatureMinC: 18.1,
    apparentTemperatureMaxC: 28.2,
    apparentTemperatureMinC: 17.8,
    condition: { code: 61, category: 'rain', labelPt: 'Chuva' },
    precipitationProbabilityMaxPercent: 70,
    precipitationSumMm: 8.4,
    windSpeedMaxKmh: 18.6,
    hourly: {
      temperatureC: Array(24).fill(21.3),
      precipitationMm: Array(24).fill(0.4),
      conditionCategory: Array(24).fill('rain'),
      isDay: Array(24).fill(true),
    },
  };
  const response = {
    timezone: 'America/Sao_Paulo',
    retrievedAtUtc: '2026-09-23T17:00:00.000Z',
    current: {
      validAtLocal: '2026-09-23T14:45',
      temperatureC: 24.1,
      apparentTemperatureC: 25.3,
      condition: { code: 3, category: 'cloudy', labelPt: 'Nublado' },
      windSpeedKmh: 12.2,
      isDay: true,
    },
    daily: Array(7).fill(day),
    attribution: FORECAST_ATTRIBUTION,
  };

  it('accepts exact results with fixed attribution and nullable rain probability', () => {
    expect(Value.Check(ForecastResponseSchema, response)).toBe(true);
    expect(
      Value.Check(ForecastResponseSchema, {
        ...response,
        daily: [{ ...day, precipitationProbabilityMaxPercent: null }, ...response.daily.slice(1)],
      }),
    ).toBe(true);
  });

  it('accepts unavailable hourly values without turning them into zero', () => {
    const hourly = {
      ...day.hourly,
      temperatureC: [null, ...day.hourly.temperatureC.slice(1)],
      precipitationMm: [null, ...day.hourly.precipitationMm.slice(1)],
    };
    expect(
      Value.Check(ForecastResponseSchema, {
        ...response,
        daily: [{ ...day, hourly }, ...response.daily.slice(1)],
      }),
    ).toBe(true);
  });

  it.each([
    { temperatureC: Array(23).fill(21.3) },
    { precipitationMm: Array(25).fill(0) },
    { precipitationMm: [-0.1, ...Array(23).fill(0)] },
    { temperatureC: ['21.3', ...Array(23).fill(21.3)] },
    { conditionCategory: ['fog', ...Array(23).fill('rain')] },
    { conditionCategory: Array(23).fill('rain') },
    { isDay: [null, ...Array(23).fill(true)] },
    { isDay: Array(25).fill(true) },
    { time: [] },
  ])('rejects malformed hourly columns %#', (override) => {
    expect(
      Value.Check(ForecastResponseSchema, {
        ...response,
        daily: [{ ...day, hourly: { ...day.hourly, ...override } }, ...response.daily.slice(1)],
      }),
    ).toBe(false);
    const { isDay: _omitted, ...withoutIsDay } = day.hourly;
    expect(
      Value.Check(ForecastResponseSchema, {
        ...response,
        daily: [{ ...day, hourly: withoutIsDay }, ...response.daily.slice(1)],
      }),
    ).toBe(false);
  });

  it('requires hourly columns on every day', () => {
    const { hourly: _omitted, ...withoutHourly } = day;
    expect(
      Value.Check(ForecastResponseSchema, {
        ...response,
        daily: [withoutHourly, ...response.daily.slice(1)],
      }),
    ).toBe(false);
  });

  it('keeps the widest valid response within the shared cache value limit', () => {
    const widestDay = {
      ...day,
      temperatureMaxC: -123.45,
      temperatureMinC: -123.45,
      apparentTemperatureMaxC: -123.45,
      apparentTemperatureMinC: -123.45,
      condition: { code: 99, category: 'storm', labelPt: 'Tempestade' },
      precipitationProbabilityMaxPercent: 100,
      precipitationSumMm: 1234.56,
      windSpeedMaxKmh: 1234.56,
      hourly: {
        temperatureC: Array(24).fill(-123.45),
        precipitationMm: Array(24).fill(1234.56),
        conditionCategory: Array(24).fill('cloudy'),
        isDay: Array(24).fill(false),
      },
    };
    const widest = {
      ...response,
      timezone: 'America/Argentina/ComodRivadavia',
      retrievedAtUtc: '2026-12-31T23:59:59.999Z',
      current: {
        ...response.current,
        temperatureC: -123.45,
        apparentTemperatureC: -123.45,
        condition: { code: 99, category: 'storm', labelPt: 'Tempestade' },
        windSpeedKmh: 1234.56,
      },
      daily: Array(7).fill(widestDay),
    };
    expect(Value.Check(ForecastResponseSchema, widest)).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(widest), 'utf8')).toBeLessThanOrEqual(
      MAX_CACHE_VALUE_BYTES,
    );
  });

  it('rejects extra fields, changed attribution and null elsewhere', () => {
    expect(Value.Check(ForecastResponseSchema, { ...response, extra: 1 })).toBe(false);
    expect(
      Value.Check(ForecastResponseSchema, {
        ...response,
        attribution: { ...FORECAST_ATTRIBUTION, provider: 'Other' },
      }),
    ).toBe(false);
    expect(
      Value.Check(ForecastResponseSchema, {
        ...response,
        daily: [{ ...day, temperatureMaxC: null }, ...response.daily.slice(1)],
      }),
    ).toBe(false);
    expect(
      Value.Check(ForecastResponseSchema, { ...response, daily: response.daily.slice(1) }),
    ).toBe(false);
  });
});
