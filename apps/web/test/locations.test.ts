import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, parseLocations, searchLocations } from '../src/api/locations';
import { requestJson } from '../src/api/http';
import { jsonResponse, locationResponse } from './fixtures';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

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
    {
      ...locationResponse,
      locations: [{ ...locationResponse.locations[0], name: 'x'.repeat(257) }],
    },
    { ...locationResponse, locations: [{ ...locationResponse.locations[0], country: ' Brasil' }] },
    { ...locationResponse, locations: [{ ...locationResponse.locations[0], region: '\u0001' }] },
    { ...locationResponse, locations: [{ ...locationResponse.locations[0], region: '\u007f' }] },
    { ...locationResponse, locations: [{ ...locationResponse.locations[0], region: '' }] },
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

  it('counts location labels in Unicode code points', () => {
    const name = '😀'.repeat(256);
    expect(
      parseLocations({
        ...locationResponse,
        locations: [{ ...locationResponse.locations[0], name }],
      }).locations[0]?.name,
    ).toBe(name);
    expect(() =>
      parseLocations({
        ...locationResponse,
        locations: [{ ...locationResponse.locations[0], name: `${name}😀` }],
      }),
    ).toThrow();
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
  ])('makes invalid and unavailable responses generic', async (response) => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response.clone());
    await expect(
      searchLocations('Curitiba', new AbortController().signal, fetchImpl),
    ).rejects.toBeInstanceOf(ApiRequestError);
  });

  it.each([
    new Response('{', { status: 429, headers: { 'content-type': 'application/json' } }),
    new Response('<html>Rate limited</html>', {
      status: 429,
      headers: { 'content-type': 'text/html' },
    }),
  ])('classifies any 429 as rate_limited regardless of body format', async (response) => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response.clone());
    await expect(
      searchLocations('Curitiba', new AbortController().signal, fetchImpl),
    ).rejects.toMatchObject({ failure: { kind: 'rate_limited' } });
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

  it('stops a stalled browser request after its timeout', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const request = requestJson(
      '/api/v1/locations?query=Rio',
      new AbortController().signal,
      fetchImpl,
    );
    const failure = expect(request).rejects.toMatchObject({ failure: { kind: 'unavailable' } });

    await vi.advanceTimersByTimeAsync(10_000);

    await failure;
    expect(fetchImpl.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it('stops a stalled response body within the same timeout', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
      const response = new Response(null, { headers: { 'content-type': 'application/json' } });
      vi.spyOn(response, 'json').mockImplementation(
        () =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      );
      return response;
    });
    const request = requestJson(
      '/api/v1/locations?query=Rio',
      new AbortController().signal,
      fetchImpl,
    );
    const failure = expect(request).rejects.toMatchObject({ failure: { kind: 'unavailable' } });

    await vi.advanceTimersByTimeAsync(10_000);

    await failure;
    expect(fetchImpl.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it('classifies an unrelated HTTP status as a generic failure', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ error: { code: 'NOT_FOUND', message: 'private detail' } }, 404),
    );
    await expect(
      searchLocations('Curitiba', new AbortController().signal, fetchImpl),
    ).rejects.toMatchObject({ failure: { kind: 'request_failed', requestId: 'test-request-1' } });
  });

  it('classifies a 429 with mismatched error code as rate_limited', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ error: { code: 'OTHER' } }, 429),
    );
    await expect(
      searchLocations('Curitiba', new AbortController().signal, fetchImpl),
    ).rejects.toMatchObject({ failure: { kind: 'rate_limited' } });
  });

  it('does not trust a mismatched error code for HTTP 503', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ error: { code: 'OTHER' } }, 503),
    );
    await expect(
      searchLocations('Curitiba', new AbortController().signal, fetchImpl),
    ).rejects.toMatchObject({ failure: { kind: 'request_failed' } });
  });

  it.each([
    new Response('{', { status: 503, headers: { 'content-type': 'application/json' } }),
    new Response('temporarily unavailable', {
      status: 503,
      headers: { 'content-type': 'text/plain' },
    }),
  ])('treats a malformed 503 body as temporary unavailability', async (response) => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response.clone());
    await expect(
      searchLocations('Curitiba', new AbortController().signal, fetchImpl),
    ).rejects.toMatchObject({ failure: { kind: 'unavailable' } });
  });
});
