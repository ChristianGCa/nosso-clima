const ALLOWED_DESTINATIONS = new Set([
  'geocoding-api.open-meteo.com/v1/search',
  'api.open-meteo.com/v1/forecast',
]);

const ALLOWED_FETCH_OPTIONS = new Set(['method', 'redirect', 'signal']);

export function createOpenMeteoTransport(fetchImpl: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    if (
      !(input instanceof URL) ||
      input.protocol !== 'https:' ||
      input.username ||
      input.password ||
      input.port ||
      input.hash ||
      !ALLOWED_DESTINATIONS.has(`${input.hostname}${input.pathname}`) ||
      init?.redirect !== 'error' ||
      (init.method !== undefined && init.method !== 'GET') ||
      Object.keys(init).some((key) => !ALLOWED_FETCH_OPTIONS.has(key))
    ) {
      throw new Error('Blocked Open-Meteo request');
    }

    return fetchImpl(new URL(input.href), {
      method: 'GET',
      redirect: 'error',
      ...(init.signal ? { signal: init.signal } : {}),
    });
  };
}
