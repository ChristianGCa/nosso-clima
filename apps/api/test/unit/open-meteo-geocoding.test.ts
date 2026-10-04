import { describe, expect, it, vi } from 'vitest';

import {
  createOpenMeteoGeocodingClient,
  fetchGeocodingJson,
  normalizeGeocodingResponse,
} from '../../src/locations/open-meteo-geocoding.js';
import { ProviderAccessFailure } from '../../src/infrastructure/reserved-open-meteo-fetch.js';

const jsonHeaders = { 'content-type': 'application/json; charset=utf-8' };

describe('Open-Meteo geocoding transport', () => {
  it('uses only the fixed HTTPS endpoint and approved parameters', async () => {
    let requestedUrl: URL | undefined;
    let requestedOptions: RequestInit | undefined;
    const fetchImpl: typeof fetch = async (input, options) => {
      requestedUrl = new URL(String(input));
      requestedOptions = options;
      return new Response('{"results":[]}', { headers: jsonHeaders });
    };

    await expect(fetchGeocodingJson('São Paulo, Brasil', fetchImpl)).resolves.toEqual({
      results: [],
    });
    expect(requestedUrl?.origin).toBe('https://geocoding-api.open-meteo.com');
    expect(requestedUrl?.pathname).toBe('/v1/search');
    const parameters = requestedUrl ? [...requestedUrl.searchParams.entries()] : undefined;
    expect(parameters).toEqual([
      ['name', 'São Paulo, Brasil'],
      ['count', '10'],
      ['language', 'pt'],
      ['format', 'json'],
    ]);
    expect(requestedOptions?.redirect).toBe('error');
    expect(requestedOptions?.signal).toBeInstanceOf(AbortSignal);
    expect(requestedOptions?.headers).toBeUndefined();
  });

  it('creates a 5-second abort signal for the entire operation', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    try {
      await fetchGeocodingJson('ab', async () => new Response('{}', { headers: jsonHeaders }));
      expect(timeout).toHaveBeenCalledWith(5_000);
    } finally {
      timeout.mockRestore();
    }
  });

  it.each([400, 429, 500])('classifies upstream status %s without its body', async (status) => {
    const fetchImpl: typeof fetch = async () =>
      new Response('private-provider-body', { status, headers: jsonHeaders });
    await expect(fetchGeocodingJson('ab', fetchImpl)).rejects.toMatchObject({
      kind: 'status',
      upstreamStatus: status,
      message: 'Geocoding provider unavailable',
    });
  });

  it.each([undefined, 'text/plain'])(
    'rejects missing or non-JSON content type: %s',
    async (contentType) => {
      const headers = contentType === undefined ? {} : { 'content-type': contentType };
      const fetchImpl: typeof fetch = async () => new Response('{}', { headers });
      await expect(fetchGeocodingJson('ab', fetchImpl)).rejects.toMatchObject({
        kind: 'content_type',
      });
    },
  );

  it('classifies a rejected fetch or redirect without leaking its error', async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new TypeError('private provider URL and query');
    };
    await expect(fetchGeocodingJson('ab', fetchImpl)).rejects.toMatchObject({
      kind: 'network',
      message: 'Geocoding provider unavailable',
    });
  });

  it.each(['quota_denied', 'redis_unavailable', 'circuit_open', 'upstream_rate_limited'] as const)(
    'preserves safe platform failure category %s',
    async (kind) => {
      await expect(
        fetchGeocodingJson('ab', async () => {
          throw new ProviderAccessFailure(kind);
        }),
      ).rejects.toMatchObject({ kind, message: 'Geocoding provider unavailable' });
    },
  );

  it('caps decoded bytes while accepting a response at the exact limit', async () => {
    const exactBody = `${' '.repeat(65_534)}[]`;
    const exactFetch: typeof fetch = async () => new Response(exactBody, { headers: jsonHeaders });
    await expect(fetchGeocodingJson('ab', exactFetch)).resolves.toEqual([]);

    const oversizedFetch: typeof fetch = async () =>
      new Response(`${exactBody} `, { headers: jsonHeaders });
    await expect(fetchGeocodingJson('ab', oversizedFetch)).rejects.toMatchObject({
      kind: 'body_too_large',
    });
  });

  it.each([new Uint8Array([0xff]), new TextEncoder().encode('{')])(
    'rejects invalid UTF-8 or JSON without returning provider text',
    async (body) => {
      const fetchImpl: typeof fetch = async () => new Response(body, { headers: jsonHeaders });
      await expect(fetchGeocodingJson('ab', fetchImpl)).rejects.toMatchObject({
        kind: 'invalid_json',
      });
    },
  );

  it('rejects a missing body as invalid JSON', async () => {
    const fetchImpl: typeof fetch = async () => new Response(null, { headers: jsonHeaders });
    await expect(fetchGeocodingJson('ab', fetchImpl)).rejects.toMatchObject({
      kind: 'invalid_json',
    });
  });

  it('classifies a failed body stream without leaking its error', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error('private upstream body'));
      },
    });
    const fetchImpl: typeof fetch = async () => new Response(stream, { headers: jsonHeaders });
    await expect(fetchGeocodingJson('ab', fetchImpl)).rejects.toMatchObject({
      kind: 'network',
      message: 'Geocoding provider unavailable',
    });
  });

  it('aborts a stalled body read even when an injected stream ignores the fetch signal', async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    const readStarted = Promise.withResolvers<void>();
    const stream = new ReadableStream<Uint8Array>(
      {
        pull() {
          readStarted.resolve();
          return new Promise<void>(() => {});
        },
      },
      { highWaterMark: 0 },
    );
    try {
      const operation = fetchGeocodingJson(
        'ab',
        async () => new Response(stream, { headers: jsonHeaders }),
      );
      await readStarted.promise;
      controller.abort();
      await expect(operation).rejects.toMatchObject({ kind: 'timeout' });
    } finally {
      timeout.mockRestore();
    }
  });

  it('stops waiting when an injected fetch ignores the abort signal', async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    try {
      const fetchImpl: typeof fetch = async () => new Promise<Response>(() => {});
      const operation = fetchGeocodingJson('ab', fetchImpl);
      controller.abort();
      await expect(operation).rejects.toMatchObject({ kind: 'timeout' });
    } finally {
      timeout.mockRestore();
    }
  }, 250);
});

const validPlace = {
  id: 3_449_435,
  name: 'São Paulo',
  country: 'Brasil',
  country_code: 'BR',
  latitude: -23.5475,
  longitude: -46.6361,
  timezone: 'America/Sao_Paulo',
  feature_code: 'PPLA',
  admin1: 'São Paulo',
};

describe('Open-Meteo geocoding response validation', () => {
  it('exposes a search client that validates before returning locations', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ results: [validPlace] }), { headers: jsonHeaders });
    const client = createOpenMeteoGeocodingClient(fetchImpl);
    await expect(client.search('São Paulo')).resolves.toMatchObject([{ id: validPlace.id }]);

    const malformedClient = createOpenMeteoGeocodingClient(
      async () =>
        new Response(JSON.stringify({ results: [{ ...validPlace, latitude: 500 }] }), {
          headers: jsonHeaders,
        }),
    );
    await expect(malformedClient.search('São Paulo')).rejects.toMatchObject({
      kind: 'invalid_response',
    });
  });

  it('normalizes an absent result and Portuguese labels without exposing upstream fields', () => {
    expect(normalizeGeocodingResponse({ generationtime_ms: 1 })).toEqual([]);
    expect(
      normalizeGeocodingResponse({ results: [{ ...validPlace, population: 12_000_000 }] }),
    ).toEqual([
      {
        id: 3_449_435,
        name: 'São Paulo',
        region: 'São Paulo',
        country: 'Brasil',
        countryCode: 'BR',
        latitude: -23.5475,
        longitude: -46.6361,
        timezone: 'America/Sao_Paulo',
      },
    ]);
  });

  it.each([undefined, '', '   '])('normalizes absent or empty admin1 to null: %s', (admin1) => {
    const candidate = { ...validPlace, admin1 };
    expect(normalizeGeocodingResponse({ results: [candidate] })[0]?.region).toBeNull();
  });

  it('accepts native fallback labels and trims public text', () => {
    const candidate = {
      ...validPlace,
      name: '  München  ',
      country: '  Deutschland ',
      admin1: ' Bayern ',
      timezone: 'Europe/Berlin',
      country_code: 'DE',
    };
    expect(normalizeGeocodingResponse({ results: [candidate] })[0]).toMatchObject({
      name: 'München',
      country: 'Deutschland',
      region: 'Bayern',
    });
  });

  it.each([
    'PPL',
    'PPLA',
    'PPLA2',
    'PPLA3',
    'PPLA4',
    'PPLA5',
    'PPLC',
    'PPLF',
    'PPLG',
    'PPLL',
    'PPLR',
    'PPLS',
    'STLMT',
  ])('accepts current populated-place code %s', (feature_code) => {
    expect(normalizeGeocodingResponse({ results: [{ ...validPlace, feature_code }] })).toHaveLength(
      1,
    );
  });

  it.each(['PPLCH', 'PPLH', 'PPLQ', 'PPLW', 'PPLX', 'ADM1'])(
    'filters historical or unsupported code %s',
    (feature_code) => {
      expect(normalizeGeocodingResponse({ results: [{ ...validPlace, feature_code }] })).toEqual(
        [],
      );
    },
  );

  it('preserves provider order, keeps first duplicate ID and returns at most five', () => {
    const results = [
      { ...validPlace, id: 1, name: 'First' },
      { ...validPlace, id: 1, name: 'Duplicate' },
      { ...validPlace, id: 2, name: 'Second' },
      { ...validPlace, id: 8, feature_code: 'PPLH' },
      ...[3, 4, 5, 6, 7].map((id) => ({ ...validPlace, id, name: `Place ${id}` })),
    ];
    expect(normalizeGeocodingResponse({ results }).map((place) => place.name)).toEqual([
      'First',
      'Second',
      'Place 3',
      'Place 4',
      'Place 5',
    ]);
  });

  it.each([
    null,
    [],
    'data',
    2,
    { results: null },
    { results: {} },
    { results: Array.from({ length: 11 }, () => validPlace) },
    { results: [null] },
    { results: [[]] },
    { results: [{ ...validPlace, feature_code: '' }] },
    { results: [{ ...validPlace, feature_code: 1 }] },
  ])('rejects invalid envelope or candidate structure: %j', (payload) => {
    expect(() => normalizeGeocodingResponse(payload)).toThrowError(
      expect.objectContaining({ kind: 'invalid_response' }),
    );
  });

  it.each([
    { id: 0 },
    { id: -1 },
    { id: 1.5 },
    { id: Number.MAX_SAFE_INTEGER + 1 },
    { id: '1' },
    { name: '' },
    { name: 1 },
    { country: '' },
    { country_code: 'br' },
    { country_code: 'BRA' },
    { country_code: 3 },
    { timezone: 'Mars/Olympus' },
    { timezone: '+01:00' },
    { timezone: 3 },
    { latitude: -90.1 },
    { latitude: 90.1 },
    { latitude: Number.NaN },
    { longitude: -180.1 },
    { longitude: 180.1 },
    { longitude: Number.POSITIVE_INFINITY },
    { admin1: 2 },
  ])('rejects malformed consumed field: %j', (override) => {
    expect(() =>
      normalizeGeocodingResponse({ results: [{ ...validPlace, ...override }] }),
    ).toThrowError(expect.objectContaining({ kind: 'invalid_response' }));
  });

  it.each(['id', 'name', 'country', 'country_code', 'timezone', 'latitude', 'longitude'] as const)(
    'rejects a missing required field: %s',
    (field) => {
      const candidate: Record<string, unknown> = { ...validPlace };
      delete candidate[field];
      expect(() => normalizeGeocodingResponse({ results: [candidate] })).toThrowError(
        expect.objectContaining({ kind: 'invalid_response' }),
      );
    },
  );

  it.each(['name', 'country', 'country_code', 'timezone', 'admin1'] as const)(
    'rejects controls in %s',
    (field) => {
      expect(() =>
        normalizeGeocodingResponse({ results: [{ ...validPlace, [field]: 'bad\u007f' }] }),
      ).toThrowError(expect.objectContaining({ kind: 'invalid_response' }));
    },
  );

  it.each(['name', 'country', 'timezone', 'admin1'] as const)(
    'enforces the 256-code-point bound in %s',
    (field) => {
      expect(() =>
        normalizeGeocodingResponse({ results: [{ ...validPlace, [field]: '😀'.repeat(257) }] }),
      ).toThrowError(expect.objectContaining({ kind: 'invalid_response' }));
    },
  );

  it('accepts WGS84 edges and exactly 256 Unicode code points', () => {
    const result = normalizeGeocodingResponse({
      results: [
        { ...validPlace, latitude: 90, longitude: -180, name: '😀'.repeat(256), timezone: 'UTC' },
      ],
    });
    expect(result[0]).toMatchObject({ latitude: 90, longitude: -180, name: '😀'.repeat(256) });
  });

  it('rejects an invalid accepted candidate even after five valid results', () => {
    const results = [
      ...[1, 2, 3, 4, 5].map((id) => ({ ...validPlace, id })),
      { ...validPlace, id: 6, latitude: 100 },
    ];
    expect(() => normalizeGeocodingResponse({ results })).toThrowError(
      expect.objectContaining({ kind: 'invalid_response' }),
    );
  });
});
