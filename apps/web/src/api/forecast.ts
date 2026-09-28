import type { Location } from './locations';
import { requestJson, unavailableFrom } from './http';
import { boolean, civilDate, exact, finite, oneOf, record, text, timezone } from './validation';

const categories = ['clear', 'cloudy', 'rain', 'snow', 'storm'] as const;
const labels = ['Limpo', 'Nublado', 'Chuva', 'Neve', 'Tempestade'] as const;

export type Condition = Readonly<{
  code: number;
  category: (typeof categories)[number];
  labelPt: (typeof labels)[number];
}>;

export type Daily = Readonly<{
  date: string;
  temperatureMaxC: number;
  temperatureMinC: number;
  apparentTemperatureMaxC: number;
  apparentTemperatureMinC: number;
  condition: Condition;
  precipitationProbabilityMaxPercent: number | null;
  precipitationSumMm: number;
  windSpeedMaxKmh: number;
}>;

export type Forecast = Readonly<{
  timezone: string;
  retrievedAtUtc: string;
  current: Readonly<{
    validAtLocal: string;
    temperatureC: number;
    apparentTemperatureC: number;
    condition: Condition;
    windSpeedKmh: number;
    isDay: boolean;
  }>;
  daily: readonly Daily[];
  attribution: Readonly<{ providerUrl: string; licenseUrl: string }>;
}>;

function condition(value: unknown): Condition {
  const item = record(value);
  const code = finite(item.code);
  if (!Number.isInteger(code)) throw new Error('invalid data');
  return { code, category: oneOf(item.category, categories), labelPt: oneOf(item.labelPt, labels) };
}

function nullableNumber(value: unknown, min = -Infinity, max = Infinity): number | null {
  return value === null ? null : finite(value, min, max);
}

function daily(value: unknown): Daily {
  const item = record(value);
  return {
    date: civilDate(item.date),
    temperatureMaxC: finite(item.temperatureMaxC),
    temperatureMinC: finite(item.temperatureMinC),
    apparentTemperatureMaxC: finite(item.apparentTemperatureMaxC),
    apparentTemperatureMinC: finite(item.apparentTemperatureMinC),
    condition: condition(item.condition),
    precipitationProbabilityMaxPercent: nullableNumber(
      item.precipitationProbabilityMaxPercent,
      0,
      100,
    ),
    precipitationSumMm: finite(item.precipitationSumMm, 0),
    windSpeedMaxKmh: finite(item.windSpeedMaxKmh, 0),
  };
}

export function parseForecast(value: unknown): Forecast {
  const root = record(value);
  const current = record(root.current);
  const retrievedAtUtc = text(root.retrievedAtUtc);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(retrievedAtUtc) ||
    !Number.isFinite(Date.parse(retrievedAtUtc))
  )
    throw new Error('invalid data');
  civilDate(retrievedAtUtc.slice(0, 10));
  const validAtLocal = text(current.validAtLocal);
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(validAtLocal))
    throw new Error('invalid data');
  civilDate(validAtLocal.slice(0, 10));
  if (!Array.isArray(root.daily) || root.daily.length !== 7) throw new Error('invalid data');
  const days = root.daily.map(daily);
  for (let index = 1; index < days.length; index += 1) {
    if (
      Date.parse(`${days[index]?.date}T00:00:00Z`) -
        Date.parse(`${days[index - 1]?.date}T00:00:00Z`) !==
      86_400_000
    )
      throw new Error('invalid data');
  }
  const credit = record(root.attribution);
  exact(credit.provider, 'Open-Meteo');
  exact(credit.license, 'CC BY 4.0');
  exact(credit.isModified, true);
  return {
    timezone: timezone(root.timezone),
    retrievedAtUtc,
    current: {
      validAtLocal,
      temperatureC: finite(current.temperatureC),
      apparentTemperatureC: finite(current.apparentTemperatureC),
      condition: condition(current.condition),
      windSpeedKmh: finite(current.windSpeedKmh, 0),
      isDay: boolean(current.isDay),
    },
    daily: days,
    attribution: {
      providerUrl: exact(credit.providerUrl, 'https://open-meteo.com/'),
      licenseUrl: exact(credit.licenseUrl, 'https://creativecommons.org/licenses/by/4.0/'),
    },
  };
}

export async function getForecast(
  location: Pick<Location, 'latitude' | 'longitude' | 'timezone'>,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<Forecast> {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    timezone: location.timezone,
  });
  try {
    return parseForecast(await requestJson(`/api/v1/forecast?${params}`, signal, fetchImpl));
  } catch (error) {
    throw unavailableFrom(error);
  }
}
