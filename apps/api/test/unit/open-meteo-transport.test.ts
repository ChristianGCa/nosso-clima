import { describe, expect, it, vi } from 'vitest';

import { createOpenMeteoTransport } from '../../src/infrastructure/open-meteo-transport.js';

describe('Open-Meteo outbound allowlist', () => {
  it.each([
    'https://geocoding-api.open-meteo.com/v1/search?name=Paris',
    'https://api.open-meteo.com/v1/forecast?latitude=-23.548',
  ])('allows only an expected URL and sends no caller headers for %s', async (rawUrl) => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}'));
    const transport = createOpenMeteoTransport(fetchImpl);
    const signal = new AbortController().signal;

    await transport(new URL(rawUrl), { signal, redirect: 'error' });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(rawUrl);
    expect(fetchImpl.mock.calls[0]?.[1]).toEqual({ method: 'GET', redirect: 'error', signal });
  });

  it.each([
    'http://api.open-meteo.com/v1/forecast',
    'https://api.open-meteo.com/other',
    'https://geocoding-api.open-meteo.com/v1/forecast',
    'https://api.open-meteo.com.evil.example/v1/forecast',
  ])('blocks destination %s before fetch', async (rawUrl) => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}'));
    const transport = createOpenMeteoTransport(fetchImpl);

    await expect(transport(new URL(rawUrl), { redirect: 'error' })).rejects.toThrow(
      /^Blocked Open-Meteo request$/,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('blocks a URL containing credentials before fetch', async () => {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.username = 'fixture';
    url.password = 'fixture';
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}'));

    await expect(createOpenMeteoTransport(fetchImpl)(url, { redirect: 'error' })).rejects.toThrow(
      /^Blocked Open-Meteo request$/,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('blocks a URL with a non-default port before fetch', async () => {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.port = '8443';
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}'));

    await expect(createOpenMeteoTransport(fetchImpl)(url, { redirect: 'error' })).rejects.toThrow(
      /^Blocked Open-Meteo request$/,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('blocks visitor headers, bodies, redirects and Request objects', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}'));
    const transport = createOpenMeteoTransport(fetchImpl);
    const url = new URL('https://api.open-meteo.com/v1/forecast');

    await expect(transport(url, { headers: { 'x-forwarded-for': 'private' } })).rejects.toThrow();
    await expect(transport(url, { method: 'POST', body: 'private' })).rejects.toThrow();
    await expect(transport(url, { redirect: 'follow' })).rejects.toThrow();
    await expect(transport(new Request(url), { redirect: 'error' })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
