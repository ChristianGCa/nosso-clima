import { describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';

import {
  LOCATION_ATTRIBUTION,
  LocationSearchResponseSchema,
} from '../../src/locations/location-contract.js';
import {
  canonicalizeLocationQuery,
  locationCacheKey,
  parseLocationQuery,
} from '../../src/locations/location-query.js';

describe('location query boundary', () => {
  it('accepts exactly one query and canonicalizes Unicode and whitespace', () => {
    expect(parseLocationQuery('/api/v1/locations?query=%EF%BC%A1%EF%BC%A2%20%20C')).toBe('AB C');
    expect(canonicalizeLocationQuery('  São   Paulo  ')).toBe('São Paulo');
    expect(canonicalizeLocationQuery('São\u00a0  Paulo')).toBe('São Paulo');
    expect(parseLocationQuery('/api/v1/locations?query=Paris%2C%20France')).toBe('Paris, France');
  });

  it('uses a locale-independent namespaced cache key', () => {
    expect(locationCacheKey('São Paulo')).toBe('location-search:v1:são paulo');
    expect(locationCacheKey('SÃO PAULO')).toBe(locationCacheKey('São Paulo'));
  });

  it('accepts the two- and 100-code-point boundaries after normalization', () => {
    expect(canonicalizeLocationQuery('ab')).toBe('ab');
    expect(canonicalizeLocationQuery('é'.repeat(100))).toBe('é'.repeat(100));
    expect(canonicalizeLocationQuery('𠮷'.repeat(100))).toBe('𠮷'.repeat(100));
  });

  it.each([
    '/api/v1/locations',
    '/api/v1/locations?foo=ab',
    '/api/v1/locations?query=ab&foo=1',
    '/api/v1/locations?query=ab&query=cd',
    '/api/v1/locations?query=ab&=1',
    '/api/v1/locations?query=ab%ZZ',
    '/api/v1/locations?query=ab%E0%A4%A',
  ])('rejects missing, extra, repeated or malformed parameters: %s', (url) => {
    expect(() => parseLocationQuery(url)).toThrow();
  });

  it('rejects a missing raw URL', () => {
    expect(() => parseLocationQuery(undefined)).toThrowError('Invalid request');
  });

  it.each([
    '',
    'a',
    'a'.repeat(101),
    '  , France',
    'Paris,  ',
    'Paris, France, Europe',
    'Paris\u0000',
    'Paris\tFrance',
    'Paris\u007f',
  ])('rejects invalid canonical city input without echoing it: %s', (query) => {
    expect(() => canonicalizeLocationQuery(query)).toThrowError('Invalid request');
  });
});

describe('location search public contract', () => {
  const location = {
    id: 3448439,
    name: 'São Paulo',
    region: 'São Paulo',
    country: 'Brasil',
    countryCode: 'BR',
    latitude: -23.5475,
    longitude: -46.63611,
    timezone: 'America/Sao_Paulo',
  };

  it('accepts an empty or valid bounded result with fixed attribution', () => {
    expect(
      Value.Check(LocationSearchResponseSchema, {
        locations: [],
        attribution: LOCATION_ATTRIBUTION,
      }),
    ).toBe(true);
    expect(
      Value.Check(LocationSearchResponseSchema, {
        locations: [location],
        attribution: LOCATION_ATTRIBUTION,
      }),
    ).toBe(true);
  });

  it('rejects extra public fields, more than five results and changed attribution', () => {
    expect(
      Value.Check(LocationSearchResponseSchema, {
        locations: [{ ...location, rawProviderField: 1 }],
        attribution: LOCATION_ATTRIBUTION,
      }),
    ).toBe(false);
    expect(
      Value.Check(LocationSearchResponseSchema, {
        locations: Array(6).fill(location),
        attribution: LOCATION_ATTRIBUTION,
      }),
    ).toBe(false);
    expect(
      Value.Check(LocationSearchResponseSchema, {
        locations: [location],
        attribution: { ...LOCATION_ATTRIBUTION, provider: 'Other' },
      }),
    ).toBe(false);
  });
});
