import {
  FORECAST_ATTRIBUTION,
  type ForecastLocation,
  type ForecastResponse,
} from './forecast-contract.js';
import { mapWmoCondition } from './wmo-condition.js';

export type ForecastFailureKind =
  | 'timeout'
  | 'network'
  | 'status'
  | 'content_type'
  | 'body_too_large'
  | 'invalid_json'
  | 'invalid_response';

export class ForecastFailure extends Error {
  readonly kind: ForecastFailureKind;
  readonly upstreamStatus?: number;

  constructor(kind: ForecastFailureKind, upstreamStatus?: number) {
    super('Forecast provider unavailable');
    this.name = 'ForecastFailure';
    this.kind = kind;
    if (upstreamStatus !== undefined) this.upstreamStatus = upstreamStatus;
  }
}

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const MAX_BODY_BYTES = 65_536;
const CURRENT_VARIABLES = 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day';
const DAILY_VARIABLES =
  'weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max';

export async function fetchForecastJson(
  location: ForecastLocation,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const url = new URL(FORECAST_URL);
  url.searchParams.set('latitude', String(location.latitude));
  url.searchParams.set('longitude', String(location.longitude));
  url.searchParams.set('timezone', location.timezone);
  url.searchParams.set('forecast_days', '7');
  url.searchParams.set('current', CURRENT_VARIABLES);
  url.searchParams.set('daily', DAILY_VARIABLES);
  url.searchParams.set('temperature_unit', 'celsius');
  url.searchParams.set('wind_speed_unit', 'kmh');
  url.searchParams.set('precipitation_unit', 'mm');
  url.searchParams.set('timeformat', 'iso8601');

  const abortController = new AbortController();
  const signal = AbortSignal.any([AbortSignal.timeout(5_000), abortController.signal]);
  let response: Response;
  try {
    response = await withAbort(fetchImpl(url, { signal, redirect: 'error' }), signal);
  } catch (failure) {
    if (failure instanceof ForecastFailure) throw failure;
    throw new ForecastFailure(signal.aborted ? 'timeout' : 'network');
  }

  if (response.status !== 200) {
    abortController.abort();
    throw new ForecastFailure('status', response.status);
  }
  const mediaType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') {
    abortController.abort();
    throw new ForecastFailure('content_type');
  }
  if (!response.body) throw new ForecastFailure('invalid_json');

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await withAbort(reader.read(), signal);
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        abortController.abort();
        throw new ForecastFailure('body_too_large');
      }
      chunks.push(value);
    }
  } catch (failure) {
    if (failure instanceof ForecastFailure) throw failure;
    throw new ForecastFailure(signal.aborted ? 'timeout' : 'network');
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new ForecastFailure('invalid_json');
  }
}

export function normalizeForecastResponse(
  payload: unknown,
  requestedLocation: ForecastLocation,
  retrievedAtUtc: string,
): ForecastResponse {
  if (!isObject(payload) || Object.hasOwn(payload, 'error')) return invalidResponse();

  const timezone = canonicalTimezone(payload.timezone);
  const requestedTimezone = canonicalTimezone(requestedLocation.timezone);
  if (timezone === undefined || requestedTimezone === undefined || timezone !== requestedTimezone) {
    return invalidResponse();
  }
  if (!isValidTimestamp(retrievedAtUtc)) return invalidResponse();

  const current = readObject(payload, 'current');
  const currentUnits = readObject(payload, 'current_units');
  const daily = readObject(payload, 'daily');
  const dailyUnits = readObject(payload, 'daily_units');
  validateUnits(currentUnits, {
    time: 'iso8601',
    temperature_2m: '°C',
    apparent_temperature: '°C',
    weather_code: 'wmo code',
    wind_speed_10m: 'km/h',
    is_day: '',
  });
  validateUnits(dailyUnits, {
    time: 'iso8601',
    weather_code: 'wmo code',
    temperature_2m_max: '°C',
    temperature_2m_min: '°C',
    apparent_temperature_max: '°C',
    apparent_temperature_min: '°C',
    precipitation_probability_max: '%',
    precipitation_sum: 'mm',
    wind_speed_10m_max: 'km/h',
  });

  const currentTime = readLocalMinute(readString(current, 'time'));
  const currentCondition = mapWmoCondition(readValue(current, 'weather_code'));
  if (currentCondition === undefined) return invalidResponse();
  const isDayValue = readValue(current, 'is_day');
  if (isDayValue !== 0 && isDayValue !== 1) return invalidResponse();

  const dates = readSevenStrings(daily, 'time');
  if (!areConsecutiveDates(dates) || dates[0] !== currentTime.slice(0, 10)) {
    return invalidResponse();
  }
  const weatherCodes = readSevenValues(daily, 'weather_code');
  const temperatureMax = readSevenValues(daily, 'temperature_2m_max');
  const temperatureMin = readSevenValues(daily, 'temperature_2m_min');
  const apparentTemperatureMax = readSevenValues(daily, 'apparent_temperature_max');
  const apparentTemperatureMin = readSevenValues(daily, 'apparent_temperature_min');
  const precipitationProbability = readSevenValues(daily, 'precipitation_probability_max');
  const precipitationSum = readSevenValues(daily, 'precipitation_sum');
  const windSpeedMax = readSevenValues(daily, 'wind_speed_10m_max');

  const normalizedDaily = dates.map((date, index) => {
    const condition = mapWmoCondition(weatherCodes[index]);
    if (condition === undefined) return invalidResponse();
    const probability = readNullableNumberValue(precipitationProbability[index], 0, 100);
    const precipitation = readNonnegativeNumberValue(precipitationSum[index]);
    return {
      date,
      temperatureMaxC: readFiniteNumberValue(temperatureMax[index]),
      temperatureMinC: readFiniteNumberValue(temperatureMin[index]),
      apparentTemperatureMaxC: readFiniteNumberValue(apparentTemperatureMax[index]),
      apparentTemperatureMinC: readFiniteNumberValue(apparentTemperatureMin[index]),
      condition,
      precipitationProbabilityMaxPercent: probability,
      precipitationSumMm: precipitation,
      windSpeedMaxKmh: readNonnegativeNumberValue(windSpeedMax[index]),
    };
  });

  return {
    timezone,
    retrievedAtUtc,
    current: {
      validAtLocal: currentTime,
      temperatureC: readFiniteNumber(current, 'temperature_2m'),
      apparentTemperatureC: readFiniteNumber(current, 'apparent_temperature'),
      condition: currentCondition,
      windSpeedKmh: readNonnegativeNumber(current, 'wind_speed_10m'),
      isDay: isDayValue === 1,
    },
    daily: normalizedDaily,
    attribution: FORECAST_ATTRIBUTION,
  };
}

async function withAbort<Value>(operation: Promise<Value>, signal: AbortSignal): Promise<Value> {
  if (signal.aborted) throw new ForecastFailure('timeout');

  let onAbort = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new ForecastFailure('timeout'));
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([operation, aborted]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

type ObjectValue = Record<string, unknown>;

function isObject(value: unknown): value is ObjectValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readObject(object: ObjectValue, key: string): ObjectValue {
  const value = readValue(object, key);
  if (!isObject(value)) return invalidResponse();
  return value;
}

function readValue(object: ObjectValue, key: string): unknown {
  if (!Object.hasOwn(object, key)) return invalidResponse();
  return object[key];
}

function readString(object: ObjectValue, key: string): string {
  const value = readValue(object, key);
  if (typeof value !== 'string') return invalidResponse();
  return value;
}

function readSevenValues(object: ObjectValue, key: string): readonly unknown[] {
  const value = readValue(object, key);
  if (!Array.isArray(value) || value.length !== 7) return invalidResponse();
  return value;
}

function readSevenStrings(object: ObjectValue, key: string): readonly string[] {
  return readSevenValues(object, key).map((value) => {
    if (typeof value !== 'string' || !isCalendarDate(value)) return invalidResponse();
    return value;
  });
}

function readFiniteNumber(object: ObjectValue, key: string): number {
  return readFiniteNumberValue(readValue(object, key));
}

function readNonnegativeNumber(object: ObjectValue, key: string): number {
  return readNonnegativeNumberValue(readValue(object, key));
}

function readFiniteNumberValue(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return invalidResponse();
  return value;
}

function readNonnegativeNumberValue(value: unknown): number {
  const number = readFiniteNumberValue(value);
  if (number < 0) return invalidResponse();
  return number;
}

function readNullableNumberValue(value: unknown, minimum: number, maximum?: number): number | null {
  if (value === null) return null;
  const number = readFiniteNumberValue(value);
  if (number < minimum || (maximum !== undefined && number > maximum)) return invalidResponse();
  return number;
}

function validateUnits(units: ObjectValue, expected: Readonly<Record<string, string>>): void {
  for (const [key, unit] of Object.entries(expected)) {
    if (readValue(units, key) !== unit) invalidResponse();
  }
}

function canonicalTimezone(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) return undefined;
  try {
    return new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

function readLocalMinute(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(value)) return invalidResponse();
  const date = value.slice(0, 10);
  const hour = Number(value.slice(11, 13));
  const minute = Number(value.slice(14, 16));
  if (!isCalendarDate(date) || hour > 23 || minute > 59) return invalidResponse();
  return value;
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function areConsecutiveDates(dates: readonly string[]): boolean {
  for (let index = 1; index < dates.length; index += 1) {
    const previous = Date.parse(`${dates[index - 1]}T00:00:00.000Z`);
    const current = Date.parse(`${dates[index]}T00:00:00.000Z`);
    if (current - previous !== 86_400_000) return false;
  }
  return true;
}

function isValidTimestamp(value: string): boolean {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function invalidResponse(): never {
  throw new ForecastFailure('invalid_response');
}
