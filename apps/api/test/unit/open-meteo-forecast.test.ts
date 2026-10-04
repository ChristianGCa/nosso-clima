import { forecastWithHourly as realForecast } from '../fixtures/forecast-with-hourly.js';
import { describe, expect, it, vi } from 'vitest';

import {
  fetchForecastJson,
  ForecastFailure,
  normalizeForecastResponse,
} from '../../src/forecast/open-meteo-forecast.js';

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
      ['hourly', 'weather_code'],
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
    ]);
    expect(result).not.toHaveProperty('latitude');
    expect(result.daily).toHaveLength(7);
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
