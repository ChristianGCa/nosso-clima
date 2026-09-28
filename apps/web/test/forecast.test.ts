import { describe, expect, it, vi } from 'vitest';
import { getForecast, parseForecast } from '../src/api/forecast';
import { forecastResponse, jsonResponse, locationResponse } from './fixtures';

describe('forecast HTTP boundary', () => {
  it('uses only selected coordinates and timezone and preserves null metrics', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(forecastResponse));
    const result = await getForecast(
      locationResponse.locations[0],
      new AbortController().signal,
      fetchImpl,
    );
    const url = new URL(String(fetchImpl.mock.calls[0]?.[0]), 'http://localhost');
    expect(url.pathname).toBe('/api/v1/forecast');
    expect([...url.searchParams.keys()]).toEqual(['latitude', 'longitude', 'timezone']);
    expect(url.searchParams.get('timezone')).toBe('America/Sao_Paulo');
    expect(result.daily).toHaveLength(7);
    expect(result.daily[0]?.precipitationProbabilityMaxPercent).toBeNull();
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
  });

  it.each([
    { ...forecastResponse, daily: forecastResponse.daily.slice(0, 6) },
    {
      ...forecastResponse,
      daily: forecastResponse.daily.map((day, index) =>
        index === 1 ? { ...day, date: '2026-09-30' } : day,
      ),
    },
    {
      ...forecastResponse,
      daily: forecastResponse.daily.map((day, index) =>
        index === 1 ? { ...day, date: '2026-02-30' } : day,
      ),
    },
    {
      ...forecastResponse,
      current: { ...forecastResponse.current, validAtLocal: '2026-09-24T25:30' },
    },
    { ...forecastResponse, retrievedAtUtc: '2026-02-30T18:32:00.000Z' },
    { ...forecastResponse, retrievedAtUtc: 'bad timestamp' },
    { ...forecastResponse, timezone: 'Mars/Olympus' },
    { ...forecastResponse, current: { ...forecastResponse.current, isDay: 'yes' } },
    { ...forecastResponse, current: { ...forecastResponse.current, temperatureC: null } },
    {
      ...forecastResponse,
      daily: forecastResponse.daily.map((day, index) =>
        index === 0 ? { ...day, precipitationSumMm: -1 } : day,
      ),
    },
    { ...forecastResponse, attribution: { ...forecastResponse.attribution, license: 'other' } },
  ])('rejects malformed forecast data', (body) => {
    expect(() => parseForecast(body)).toThrow();
  });

  it('classifies a 429 and a 503 without exposing remote messages', async () => {
    const location = locationResponse.locations[0];
    const limited = vi.fn<typeof fetch>(async () =>
      jsonResponse({ error: { code: 'RATE_LIMITED', message: 'secret' } }, 429),
    );
    const unavailable = vi.fn<typeof fetch>(async () =>
      jsonResponse({ error: { code: 'SERVICE_UNAVAILABLE' } }, 503),
    );
    await expect(
      getForecast(location, new AbortController().signal, limited),
    ).rejects.toMatchObject({ failure: { kind: 'rate_limited' } });
    await expect(
      getForecast(location, new AbortController().signal, unavailable),
    ).rejects.toMatchObject({ failure: { kind: 'unavailable' } });
  });
});
