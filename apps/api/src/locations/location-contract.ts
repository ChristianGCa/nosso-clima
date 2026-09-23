import { type Static, Type } from 'typebox';

export const LOCATION_ATTRIBUTION = Object.freeze({
  provider: 'Open-Meteo',
  source: 'GeoNames',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  isModified: true,
  providerUrl: 'https://open-meteo.com/',
  sourceUrl: 'https://www.geonames.org/',
} as const);

export const LocationSchema = Type.Object(
  {
    id: Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
    name: Type.String({ minLength: 1 }),
    region: Type.Union([Type.String(), Type.Null()]),
    country: Type.String({ minLength: 1 }),
    countryCode: Type.String({ pattern: '^[A-Z]{2}$' }),
    latitude: Type.Number({ minimum: -90, maximum: 90 }),
    longitude: Type.Number({ minimum: -180, maximum: 180 }),
    timezone: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export const LocationSearchResponseSchema = Type.Object(
  {
    locations: Type.Array(LocationSchema, { maxItems: 5 }),
    attribution: Type.Object(
      {
        provider: Type.Literal(LOCATION_ATTRIBUTION.provider),
        source: Type.Literal(LOCATION_ATTRIBUTION.source),
        license: Type.Literal(LOCATION_ATTRIBUTION.license),
        licenseUrl: Type.Literal(LOCATION_ATTRIBUTION.licenseUrl),
        isModified: Type.Literal(LOCATION_ATTRIBUTION.isModified),
        providerUrl: Type.Literal(LOCATION_ATTRIBUTION.providerUrl),
        sourceUrl: Type.Literal(LOCATION_ATTRIBUTION.sourceUrl),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export type Location = Readonly<Static<typeof LocationSchema>>;
export type LocationSearchResponse = Readonly<{
  locations: readonly Location[];
  attribution: Readonly<Static<typeof LocationSearchResponseSchema>['attribution']>;
}>;
