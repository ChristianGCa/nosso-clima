import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, parseLocations, searchLocations } from '../src/api/locations';
import { jsonResponse, locationResponse } from './fixtures';

afterEach(() => vi.unstubAllEnvs());

describe('location HTTP boundary', () => {
  it('parses the consumed fields and sends only the query parameter', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(locationResponse));
    const result = await searchLocations('São Paulo &', new AbortController().signal, fetchImpl);
    const url = new URL(String(fetchImpl.mock.calls[0]?.[0]), 'http://localhost');
    expect(url.pathname).toBe('/api/v1/locations');
    expect([...url.searchParams.keys()]).toEqual(['query']);
    expect(url.searchParams.get('query')).toBe('São Paulo &');
    expect(result.locations[0]?.region).toBe('São Paulo');
    expect(result.attribution.sourceUrl).toBe('https://www.geonames.org/');
    expect(parseLocations({ ...locationResponse, locations: [] }).locations).toEqual([]);
    expect(
      parseLocations({
        ...locationResponse,
        locations: [{ ...locationResponse.locations[0], region: '' }],
      }).locations[0]?.region,
    ).toBe('');
  });

  it('uses only the configured API origin', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/');
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(locationResponse));
    await searchLocations('Rio', new AbortController().signal, fetchImpl);
    const url = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(url.origin).toBe('https://api.example.test');
    expect(url.pathname).toBe('/api/v1/locations');
  });

  it.each([
    null,
    { ...locationResponse, locations: null },
    { ...locationResponse, locations: [{ ...locationResponse.locations[0], latitude: 'wrong' }] },
    { ...locationResponse, locations: [{ ...locationResponse.locations[0], countryCode: 'BRA' }] },
    { ...locationResponse, locations: [{ ...locationResponse.locations[0], region: 5 }] },
    { ...locationResponse, locations: [{ ...locationResponse.locations[0], id: 1.5 }] },
    {
      ...locationResponse,
      locations: [{ ...locationResponse.locations[0], timezone: 'Mars/Olympus' }],
    },
    { ...locationResponse, attribution: { ...locationResponse.attribution, source: 'unknown' } },
    {
      ...locationResponse,
      locations: Array.from({ length: 6 }, () => locationResponse.locations[0]),
    },
  ])('rejects malformed location data', (body) => {
    expect(() => parseLocations(body)).toThrow();
  });

  it('accepts a location without a region', () => {
    expect(
      parseLocations({
        ...locationResponse,
        locations: [{ ...locationResponse.locations[0], region: null }],
      }).locations[0]?.region,
    ).toBeNull();
  });

  it('classifies valid rate limits without leaking messages', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ error: { code: 'RATE_LIMITED', message: 'secret' } }, 429),
    );
    await expect(
      searchLocations('Curitiba', new AbortController().signal, fetchImpl),
    ).rejects.toMatchObject({
      failure: { kind: 'rate_limited', requestId: 'test-request-1' },
    });
  });

  it.each([
    jsonResponse({ error: { code: 'SERVICE_UNAVAILABLE' } }, 503),
    jsonResponse({ invalid: true }),
    new Response('not json', { headers: { 'content-type': 'text/plain' } }),
    new Response('{', { headers: { 'content-type': 'application/json' } }),
    new Response('{', { status: 429, headers: { 'content-type': 'application/json' } }),
  ])('makes invalid and unavailable responses generic', async (response) => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response.clone());
    await expect(
      searchLocations('Curitiba', new AbortController().signal, fetchImpl),
    ).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('makes network failure generic', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new Error('private provider details');
    });
    await expect(
      searchLocations('Curitiba', new AbortController().signal, fetchImpl),
    ).rejects.toMatchObject({
      failure: { kind: 'unavailable' },
    });
  });

  it('classifies an unrelated HTTP status as a generic failure', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ error: { code: 'NOT_FOUND', message: 'private detail' } }, 404),
    );
    await expect(
      searchLocations('Curitiba', new AbortController().signal, fetchImpl),
    ).rejects.toMatchObject({ failure: { kind: 'request_failed', requestId: 'test-request-1' } });
  });

  it.each([429, 503])('does not trust a mismatched error code for HTTP %i', async (status) => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ error: { code: 'OTHER' } }, status),
    );
    await expect(
      searchLocations('Curitiba', new AbortController().signal, fetchImpl),
    ).rejects.toMatchObject({ failure: { kind: 'request_failed' } });
  });
});
