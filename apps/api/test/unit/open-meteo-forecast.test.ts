import { forecastWithHourly as realForecast } from '../fixtures/forecast-with-hourly.js';
import capturedHourlyForecast from '../fixtures/open-meteo-forecast-hourly.json' with {
  type: 'json',
};
import { describe, expect, it, vi } from 'vitest';

import {
  fetchForecastJson,
  ForecastFailure,
  normalizeForecastResponse,
} from '../../src/forecast/open-meteo-forecast.js';
import { ProviderAccessFailure } from '../../src/infrastructure/reserved-open-meteo-fetch.js';

const location = {
  latitude: -23.548,
  longitude: -46.636,
  timezone: 'America/Sao_Paulo',
} as const;
const jsonHeaders = { 'content-type': 'application/json; charset=utf-8' };

describe('Open-Meteo forecast transport', () => {
  it('uses the fixed HTTPS endpoint and approved parameters', async () => {
    let requestedUrl: URL | undefined;
    let requestedOptions: RequestInit | undefined;
    const fetchImpl: typeof fetch = async (input, options) => {
      requestedUrl = new URL(String(input));
      requestedOptions = options;
      return new Response(JSON.stringify(realForecast), { headers: jsonHeaders });
    };

    await expect(fetchForecastJson(location, fetchImpl)).resolves.toEqual(realForecast);
    expect(requestedUrl?.origin).toBe('https://api.open-meteo.com');
    expect(requestedUrl?.pathname).toBe('/v1/forecast');
    expect([...(requestedUrl?.searchParams.entries() ?? [])]).toEqual([
      ['latitude', '-23.548'],
      ['longitude', '-46.636'],
      ['timezone', 'America/Sao_Paulo'],
      ['forecast_days', '7'],
      ['current', 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day'],
      ['hourly', 'weather_code,temperature_2m,precipitation,is_day'],
      [
        'daily',
        'temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max',
      ],
      ['temperature_unit', 'celsius'],
      ['wind_speed_unit', 'kmh'],
      ['precipitation_unit', 'mm'],
      ['timeformat', 'iso8601'],
    ]);
    expect(requestedOptions?.redirect).toBe('error');
    expect(requestedOptions?.signal).toBeInstanceOf(AbortSignal);
    expect(requestedOptions?.headers).toBeUndefined();
  });

  it('creates one 5-second timeout for fetch and body consumption', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    try {
      await fetchForecastJson(location, async () => new Response('{}', { headers: jsonHeaders }));
      expect(timeout).toHaveBeenCalledWith(5_000);
    } finally {
      timeout.mockRestore();
    }
  });

  it.each([400, 429, 500])('classifies upstream status %s without its body', async (status) => {
    const fetchImpl: typeof fetch = async () =>
      new Response('private-provider-body', { status, headers: jsonHeaders });
    await expect(fetchForecastJson(location, fetchImpl)).rejects.toMatchObject({
      name: 'ForecastFailure',
      kind: 'status',
      upstreamStatus: status,
      message: 'Forecast provider unavailable',
    });
  });

  it.each([undefined, 'text/plain'])(
    'rejects missing or non-JSON content type: %s',
    async (contentType) => {
      const headers = contentType === undefined ? {} : { 'content-type': contentType };
      const fetchImpl: typeof fetch = async () => new Response('{}', { headers });
      await expect(fetchForecastJson(location, fetchImpl)).rejects.toMatchObject({
        kind: 'content_type',
      });
    },
  );

  it('classifies network and redirect failures without leaking provider text', async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new TypeError('private provider URL and query');
    };
    await expect(fetchForecastJson(location, fetchImpl)).rejects.toMatchObject({
      kind: 'network',
      message: 'Forecast provider unavailable',
    });
  });

  it.each(['quota_denied', 'redis_unavailable', 'circuit_open', 'upstream_rate_limited'] as const)(
    'preserves safe platform failure category %s',
    async (kind) => {
      await expect(
        fetchForecastJson(location, async () => {
          throw new ProviderAccessFailure(kind);
        }),
      ).rejects.toMatchObject({ kind, message: 'Forecast provider unavailable' });
    },
  );

  it('caps decoded bytes while accepting an exact 64 KiB body', async () => {
    const exactBody = `${' '.repeat(65_534)}{}`;
    const exactFetch: typeof fetch = async () => new Response(exactBody, { headers: jsonHeaders });
    await expect(fetchForecastJson(location, exactFetch)).resolves.toEqual({});

    const oversizedFetch: typeof fetch = async () =>
      new Response(`${exactBody} `, { headers: jsonHeaders });
    await expect(fetchForecastJson(location, oversizedFetch)).rejects.toMatchObject({
      kind: 'body_too_large',
    });
  });

  it.each([new Uint8Array([0xff]), new TextEncoder().encode('{')])(
    'rejects invalid UTF-8 or JSON without returning provider text',
    async (body) => {
      const fetchImpl: typeof fetch = async () => new Response(body, { headers: jsonHeaders });
      await expect(fetchForecastJson(location, fetchImpl)).rejects.toMatchObject({
        kind: 'invalid_json',
      });
    },
  );

  it('aborts a stalled body read even when the stream ignores the signal', async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    const readStarted = Promise.withResolvers<void>();
    const stream = new ReadableStream<Uint8Array>(
      {
        pull() {
          readStarted.resolve();
          return new Promise<void>(() => {});
        },
      },
      { highWaterMark: 0 },
    );
    try {
      const operation = fetchForecastJson(
        location,
        async () => new Response(stream, { headers: jsonHeaders }),
      );
      await readStarted.promise;
      controller.abort();
      await expect(operation).rejects.toMatchObject({ kind: 'timeout' });
    } finally {
      timeout.mockRestore();
    }
  });

  it('classifies a stream failure after a valid chunk as a network failure', async () => {
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulls += 1;
          if (pulls === 1) {
            controller.enqueue(new TextEncoder().encode('{'));
          } else {
            controller.error(new Error('private provider body detail'));
          }
        },
      },
      { highWaterMark: 0 },
    );
    const fetchImpl: typeof fetch = async () => new Response(stream, { headers: jsonHeaders });

    await expect(fetchForecastJson(location, fetchImpl)).rejects.toMatchObject({
      kind: 'network',
      message: 'Forecast provider unavailable',
    });
    expect(pulls).toBe(2);
  });

  it('stops waiting when fetch ignores the abort signal', async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    try {
      const operation = fetchForecastJson(location, async () => new Promise<Response>(() => {}));
      controller.abort();
      await expect(operation).rejects.toMatchObject({ kind: 'timeout' });
    } finally {
      timeout.mockRestore();
    }
  }, 250);
});

it('exports a bounded failure type without provider diagnostics', () => {
  const failure = new ForecastFailure('network');
  expect(failure).toBeInstanceOf(Error);
  expect(failure.message).toBe('Forecast provider unavailable');
  expect(failure.stack).not.toContain('private');
});

describe('Open-Meteo forecast response validation', () => {
  it('normalizes the captured provider response to the public contract', () => {
    const result = normalizeForecastResponse(realForecast, location, '2026-09-23T23:00:00.000Z');
    expect(result).toMatchObject({
      timezone: 'America/Sao_Paulo',
      retrievedAtUtc: '2026-09-23T23:00:00.000Z',
      current: {
        validAtLocal: '2026-09-23T20:45',
        temperatureC: 13,
        apparentTemperatureC: 12,
        condition: { code: 3, category: 'cloudy', labelPt: 'Nublado' },
        windSpeedKmh: 10.8,
        isDay: false,
      },
    });
    expect(result.daily[0]).toMatchObject({
      date: '2026-09-23',
      condition: { code: 80, category: 'rain', labelPt: 'Chuva' },
      precipitationProbabilityMaxPercent: 97,
    });
    expect(Object.keys(result.daily[0] ?? {})).toEqual([
      'date',
      'temperatureMaxC',
      'temperatureMinC',
      'apparentTemperatureMaxC',
      'apparentTemperatureMinC',
      'condition',
      'precipitationProbabilityMaxPercent',
      'precipitationSumMm',
      'windSpeedMaxKmh',
      'hourly',
    ]);
    expect(Object.keys(result.daily[0]?.hourly ?? {})).toEqual([
      'temperatureC',
      'precipitationMm',
      'conditionCategory',
      'isDay',
    ]);
    expect(result).not.toHaveProperty('latitude');
    expect(result.daily).toHaveLength(7);
  });

  it('splits hourly columns by local day with position equal to the hour', () => {
    const result = normalizeForecastResponse(realForecast, location, '2026-09-23T23:00:00.000Z');
    for (const [day, record] of result.daily.entries()) {
      expect(record.hourly.temperatureC).toEqual(
        realForecast.hourly.temperature_2m.slice(day * 24, (day + 1) * 24),
      );
      expect(record.hourly.precipitationMm).toEqual(
        realForecast.hourly.precipitation.slice(day * 24, (day + 1) * 24),
      );
    }
    expect(result.daily[0]?.hourly.temperatureC[0]).toBe(13);
    expect(result.daily[0]?.hourly.temperatureC[23]).toBe(16.1);
    expect(result.daily[0]?.hourly.precipitationMm.slice(0, 3)).toEqual([3.1, 3.1, 0]);
    expect(result.daily[0]?.hourly.isDay.slice(5, 7)).toEqual([false, true]);
    expect(result.daily[0]?.hourly.isDay.slice(17, 19)).toEqual([true, false]);
  });

  it('maps each hourly WMO code to its category without exposing the code', () => {
    const payload = {
      ...realForecast,
      hourly: {
        ...realForecast.hourly,
        weather_code: [0, 3, 61, 71, 95, ...realForecast.hourly.weather_code.slice(5)],
      },
    };
    const result = normalizeForecastResponse(payload, location, '2026-09-23T23:00:00.000Z');
    expect(result.daily[0]?.hourly.conditionCategory.slice(0, 5)).toEqual([
      'clear',
      'cloudy',
      'rain',
      'snow',
      'storm',
    ]);
    expect(result.daily[0]?.hourly.conditionCategory).toHaveLength(24);
  });

  it('normalizes a captured response of the hourly query', () => {
    const result = normalizeForecastResponse(
      capturedHourlyForecast,
      location,
      '2026-11-03T23:30:00.000Z',
    );
    expect(result.current.validAtLocal).toBe('2026-11-03T21:00');
    expect(result.daily.map((day) => day.date)).toEqual(capturedHourlyForecast.daily.time);
    expect(result.daily[0]?.hourly.temperatureC).toEqual(
      capturedHourlyForecast.hourly.temperature_2m.slice(0, 24),
    );
    expect(result.daily[6]?.hourly.precipitationMm).toEqual(
      capturedHourlyForecast.hourly.precipitation.slice(144, 168),
    );
    expect(result.daily[0]?.hourly.isDay).toEqual(
      capturedHourlyForecast.hourly.is_day.slice(0, 24).map((value) => value === 1),
    );
  });

  it('preserves unavailable hourly values without turning them into zero', () => {
    const payload = {
      ...realForecast,
      hourly: {
        ...realForecast.hourly,
        temperature_2m: [null, ...realForecast.hourly.temperature_2m.slice(1)],
        precipitation: [...realForecast.hourly.precipitation.slice(0, 167), null],
      },
    };
    const result = normalizeForecastResponse(payload, location, '2026-09-23T23:00:00.000Z');
    expect(result.daily[0]?.hourly.temperatureC[0]).toBeNull();
    expect(result.daily[6]?.hourly.precipitationMm[23]).toBeNull();
  });

  it('preserves unavailable rain probability without turning it into zero', () => {
    const payload = {
      ...realForecast,
      daily: {
        ...realForecast.daily,
        precipitation_probability_max: [
          null,
          ...realForecast.daily.precipitation_probability_max.slice(1),
        ],
      },
    };
    const result = normalizeForecastResponse(payload, location, '2026-09-23T23:00:00.000Z');
    expect(result.daily[0]).toMatchObject({
      precipitationProbabilityMaxPercent: null,
    });
  });

  it('uses the most frequent hourly category instead of an isolated severe event', () => {
    const payload = {
      ...realForecast,
      hourly: {
        ...realForecast.hourly,
        weather_code: [
          ...Array(20).fill(3),
          ...Array(4).fill(95),
          ...realForecast.hourly.weather_code.slice(24),
        ],
      },
    };
    const result = normalizeForecastResponse(payload, location, '2026-09-23T23:00:00.000Z');
    expect(result.daily[0]?.condition).toEqual({ code: 3, category: 'cloudy', labelPt: 'Nublado' });
  });

  it('breaks category and WMO-code ties by first hourly occurrence', () => {
    const payload = {
      ...realForecast,
      hourly: {
        ...realForecast.hourly,
        weather_code: [
          ...Array(6).fill(61),
          ...Array(6).fill(3),
          ...Array(6).fill(63),
          ...Array(6).fill(2),
          ...realForecast.hourly.weather_code.slice(24),
        ],
      },
    };
    const result = normalizeForecastResponse(payload, location, '2026-09-23T23:00:00.000Z');
    expect(result.daily[0]?.condition).toEqual({ code: 61, category: 'rain', labelPt: 'Chuva' });
  });

  it.each([
    { timezone: 'UTC' },
    { timezone: 'Not/A_Zone' },
    { current: { ...realForecast.current, weather_code: 4 } },
    { daily: { ...realForecast.daily, time: realForecast.daily.time.slice(0, 6) } },
    {
      daily: {
        ...realForecast.daily,
        time: [
          realForecast.daily.time[0],
          realForecast.daily.time[2],
          ...realForecast.daily.time.slice(2),
        ],
      },
    },
    { current: { ...realForecast.current, time: '2026-09-24T20:45' } },
    {
      daily: {
        ...realForecast.daily,
        temperature_2m_max: [null, ...realForecast.daily.temperature_2m_max.slice(1)],
      },
    },
    {
      daily: {
        ...realForecast.daily,
        precipitation_probability_max: [
          101,
          ...realForecast.daily.precipitation_probability_max.slice(1),
        ],
      },
    },
    { current_units: { ...realForecast.current_units, temperature_2m: '°F' } },
    { hourly_units: { ...realForecast.hourly_units, weather_code: 'unknown' } },
    { hourly: { ...realForecast.hourly, weather_code: realForecast.hourly.weather_code.slice(1) } },
    {
      hourly: {
        ...realForecast.hourly,
        weather_code: [4, ...realForecast.hourly.weather_code.slice(1)],
      },
    },
    {
      hourly: {
        ...realForecast.hourly,
        time: ['2026-09-24T00:00', ...realForecast.hourly.time.slice(1)],
      },
    },
    { hourly_units: { ...realForecast.hourly_units, temperature_2m: '°F' } },
    { hourly_units: { ...realForecast.hourly_units, precipitation: 'inch' } },
    { hourly_units: { ...realForecast.hourly_units, is_day: 'flag' } },
    { hourly: { ...realForecast.hourly, is_day: [2, ...realForecast.hourly.is_day.slice(1)] } },
    {
      hourly: { ...realForecast.hourly, is_day: [true, ...realForecast.hourly.is_day.slice(1)] },
    },
    { hourly: { ...realForecast.hourly, is_day: realForecast.hourly.is_day.slice(1) } },
    { hourly_units: { weather_code: 'wmo code', time: 'iso8601', temperature_2m: '°C' } },
    {
      hourly: {
        ...realForecast.hourly,
        temperature_2m: realForecast.hourly.temperature_2m.slice(1),
      },
    },
    {
      hourly: {
        ...realForecast.hourly,
        precipitation: [...realForecast.hourly.precipitation, 0],
      },
    },
    {
      hourly: {
        time: realForecast.hourly.time,
        weather_code: realForecast.hourly.weather_code,
        temperature_2m: realForecast.hourly.temperature_2m,
      },
    },
    {
      hourly: {
        ...realForecast.hourly,
        precipitation: [-0.1, ...realForecast.hourly.precipitation.slice(1)],
      },
    },
    {
      hourly: {
        ...realForecast.hourly,
        temperature_2m: ['13.0', ...realForecast.hourly.temperature_2m.slice(1)],
      },
    },
    {
      hourly: {
        ...realForecast.hourly,
        temperature_2m: [Number.NaN, ...realForecast.hourly.temperature_2m.slice(1)],
      },
    },
    {
      hourly: {
        ...realForecast.hourly,
        precipitation: { length: 168 },
      },
    },
  ])('rejects malformed consumed provider data %#', (override) => {
    expect(() =>
      normalizeForecastResponse(
        { ...realForecast, ...override },
        location,
        '2026-09-23T23:00:00.000Z',
      ),
    ).toThrowError(expect.objectContaining({ kind: 'invalid_response' }));
  });
});
