import { ApiError } from '../errors/api-error.js';
import type { ForecastLocation } from './forecast-contract.js';

const DECIMAL = /^([+-]?)(\d+(?:\.\d*)?|\.\d+)(?:[eE]([+-]?\d+))?$/u;
const EXPECTED_KEYS = new Set(['latitude', 'longitude', 'timezone']);

export function parseForecastQuery(rawUrl: string | undefined): ForecastLocation {
  if (rawUrl === undefined) return invalidQuery();

  let url: URL;
  try {
    url = new URL(rawUrl, 'http://localhost');
    decodeURIComponent(url.search);
  } catch {
    return invalidQuery();
  }

  if (url.searchParams.size !== 3) return invalidQuery();
  for (const key of url.searchParams.keys()) {
    if (!EXPECTED_KEYS.has(key)) return invalidQuery();
  }

  const latitude = url.searchParams.get('latitude');
  const longitude = url.searchParams.get('longitude');
  const timezone = url.searchParams.get('timezone');
  if (latitude === null || longitude === null || timezone === null) return invalidQuery();

  return canonicalizeForecastLocation({
    latitude: parseCoordinate(latitude, -90, 90),
    longitude: parseCoordinate(longitude, -180, 180),
    timezone: canonicalTimezone(timezone),
  });
}

export function canonicalizeForecastLocation(location: ForecastLocation): ForecastLocation {
  return {
    latitude: roundCoordinate(location.latitude, -90, 90),
    longitude: roundCoordinate(location.longitude, -180, 180),
    timezone: canonicalTimezone(location.timezone),
  };
}

export function forecastCacheKey(location: ForecastLocation): string {
  return `weather-forecast:v1:${location.latitude}:${location.longitude}:${location.timezone}`;
}

function parseCoordinate(text: string, min: number, max: number): number {
  if (text.length === 0 || text.length > 32) return invalidQuery();
  const match = DECIMAL.exec(text);
  if (match === null) return invalidQuery();
  const value = Number(text);
  if (!Number.isFinite(value) || value < min || value > max) return invalidQuery();

  // The regular expression always captures sign and mantissa when it matches.
  const captures = match as RegExpExecArray & { 1: string; 2: string; 3?: string };
  const sign = captures[1];
  const mantissa = captures[2];
  const exponentText = captures[3];
  const [whole, fraction = ''] = mantissa.split('.');
  const digits = BigInt(`${whole || '0'}${fraction}`);
  const exponent = exponentText === undefined ? 0 : Number(exponentText);
  const shift = exponent - fraction.length + 3;
  let scaled: bigint;
  if (digits === 0n || shift < -1000) {
    scaled = 0n;
  } else if (shift >= 0) {
    scaled = digits * 10n ** BigInt(shift);
  } else {
    const divisor = 10n ** BigInt(-shift);
    scaled = (digits + divisor / 2n) / divisor;
  }
  const rounded = Number(scaled) / 1000;
  return rounded === 0 ? 0 : sign === '-' ? -rounded : rounded;
}

function roundCoordinate(value: number, min: number, max: number): number {
  return parseCoordinate(String(value), min, max);
}

function canonicalTimezone(timezone: string): string {
  if (
    timezone.length === 0 ||
    timezone.length > 64 ||
    timezone.startsWith('+') ||
    timezone.startsWith('-') ||
    [...timezone].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint < 32 || codePoint === 127);
    })
  ) {
    return invalidQuery();
  }
  try {
    return new Intl.DateTimeFormat('en', { timeZone: timezone }).resolvedOptions().timeZone;
  } catch {
    return invalidQuery();
  }
}

function invalidQuery(): never {
  throw new ApiError('VALIDATION_ERROR');
}
