import type { EnvironmentInput } from './env.js';
import type { QuotaLimits } from '../infrastructure/quota-reservation.js';

const MAX_LIMITS: QuotaLimits = {
  minute: 599_000,
  hour: 4_999_000,
  day: 9_999_000,
  month: 299_999_000,
};

export type ProviderPolicy = Readonly<{
  limits: QuotaLimits;
  costs: Readonly<{ geocoding: number; forecast: number }>;
  circuit: Readonly<{ cooldownMs: number; probeMs: number }>;
}>;

export function parseProviderPolicy(environment: EnvironmentInput): ProviderPolicy {
  const limits = {
    minute: readPositiveInteger(environment, 'OPEN_METEO_MINUTE_CREDITS', MAX_LIMITS.minute, 1_000),
    hour: readPositiveInteger(environment, 'OPEN_METEO_HOUR_CREDITS', MAX_LIMITS.hour, 1_000),
    day: readPositiveInteger(environment, 'OPEN_METEO_DAY_CREDITS', MAX_LIMITS.day, 1_000),
    month: readPositiveInteger(environment, 'OPEN_METEO_MONTH_CREDITS', MAX_LIMITS.month, 1_000),
  };
  const costs = {
    geocoding: readPositiveInteger(
      environment,
      'OPEN_METEO_GEOCODING_CREDITS',
      Number.MAX_SAFE_INTEGER,
      1_000,
    ),
    forecast: readPositiveInteger(
      environment,
      'OPEN_METEO_FORECAST_CREDITS',
      Number.MAX_SAFE_INTEGER,
      1_000,
    ),
  };
  if (
    costs.geocoding < 1_000 ||
    costs.forecast < 1_000 ||
    Object.values(limits).some((limit) => costs.geocoding > limit || costs.forecast > limit)
  ) {
    throw new Error('Invalid Open-Meteo credit policy');
  }
  const circuit = {
    cooldownMs: readPositiveInteger(environment, 'OPEN_METEO_429_COOLDOWN_MS', 3_600_000, 60_000),
    probeMs: readPositiveInteger(environment, 'OPEN_METEO_PROBE_MS', 60_000, 10_000),
  };
  if (circuit.probeMs > circuit.cooldownMs) {
    throw new Error('Invalid Open-Meteo circuit timing');
  }
  return Object.freeze({ limits, costs, circuit });
}

function readPositiveInteger(
  environment: EnvironmentInput,
  key: string,
  maximum: number,
  previewDefault: number,
): number {
  const raw =
    environment[key] ??
    (environment.VERCEL_ENV === 'preview' ? previewDefault.toString() : undefined);
  if (!raw || !/^[1-9][0-9]*$/.test(raw)) throw new Error(`Invalid ${key}`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > maximum) throw new Error(`Invalid ${key}`);
  return value;
}
