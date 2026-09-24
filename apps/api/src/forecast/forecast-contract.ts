import { type Static, Type } from 'typebox';

export const FORECAST_ATTRIBUTION = Object.freeze({
  provider: 'Open-Meteo',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  isModified: true,
  providerUrl: 'https://open-meteo.com/',
} as const);

const ConditionSchema = Type.Object(
  {
    code: Type.Integer(),
    category: Type.Union([
      Type.Literal('clear'),
      Type.Literal('cloudy'),
      Type.Literal('rain'),
      Type.Literal('snow'),
      Type.Literal('storm'),
    ]),
    labelPt: Type.Union([
      Type.Literal('Limpo'),
      Type.Literal('Nublado'),
      Type.Literal('Chuva'),
      Type.Literal('Neve'),
      Type.Literal('Tempestade'),
    ]),
  },
  { additionalProperties: false },
);

const CurrentSchema = Type.Object(
  {
    validAtLocal: Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$' }),
    temperatureC: Type.Number(),
    apparentTemperatureC: Type.Number(),
    condition: ConditionSchema,
    windSpeedKmh: Type.Number({ minimum: 0 }),
    isDay: Type.Boolean(),
  },
  { additionalProperties: false },
);

const DailySchema = Type.Object(
  {
    date: Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
    temperatureMaxC: Type.Number(),
    temperatureMinC: Type.Number(),
    apparentTemperatureMaxC: Type.Number(),
    apparentTemperatureMinC: Type.Number(),
    condition: ConditionSchema,
    precipitationProbabilityMaxPercent: Type.Union([
      Type.Number({ minimum: 0, maximum: 100 }),
      Type.Null(),
    ]),
    precipitationSumMm: Type.Number({ minimum: 0 }),
    windSpeedMaxKmh: Type.Number({ minimum: 0 }),
    uvIndexMax: Type.Union([Type.Number({ minimum: 0 }), Type.Null()]),
    uvRisk: Type.Union([
      Type.Literal('low'),
      Type.Literal('moderate'),
      Type.Literal('high'),
      Type.Literal('very_high'),
      Type.Literal('extreme'),
      Type.Null(),
    ]),
  },
  { additionalProperties: false },
);

export const ForecastResponseSchema = Type.Object(
  {
    timezone: Type.String({ minLength: 1 }),
    retrievedAtUtc: Type.String({ format: 'date-time' }),
    current: CurrentSchema,
    daily: Type.Array(DailySchema, { minItems: 7, maxItems: 7 }),
    attribution: Type.Object(
      {
        provider: Type.Literal(FORECAST_ATTRIBUTION.provider),
        license: Type.Literal(FORECAST_ATTRIBUTION.license),
        licenseUrl: Type.Literal(FORECAST_ATTRIBUTION.licenseUrl),
        isModified: Type.Literal(FORECAST_ATTRIBUTION.isModified),
        providerUrl: Type.Literal(FORECAST_ATTRIBUTION.providerUrl),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export type ForecastResponse = Readonly<Static<typeof ForecastResponseSchema>>;
export type ForecastLocation = Readonly<{
  latitude: number;
  longitude: number;
  timezone: string;
}>;
