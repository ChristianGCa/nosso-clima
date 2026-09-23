import { describe, expect, it, vi } from 'vitest';

import { fetchGeocodingJson } from '../../src/locations/open-meteo-geocoding.js';

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
