export type GeocodingFailureKind =
  | 'timeout'
  | 'network'
  | 'status'
  | 'content_type'
  | 'body_too_large'
  | 'invalid_json'
  | 'invalid_response';

export class GeocodingFailure extends Error {
  readonly kind: GeocodingFailureKind;
  readonly upstreamStatus?: number;

  constructor(kind: GeocodingFailureKind, upstreamStatus?: number) {
    super('Geocoding provider unavailable');
    this.name = 'GeocodingFailure';
    this.kind = kind;
    if (upstreamStatus !== undefined) this.upstreamStatus = upstreamStatus;
  }
}

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const MAX_BODY_BYTES = 65_536;

export async function fetchGeocodingJson(
  canonicalQuery: string,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const url = new URL(GEOCODING_URL);
  url.searchParams.set('name', canonicalQuery);
  url.searchParams.set('count', '10');
  url.searchParams.set('language', 'pt');
  url.searchParams.set('format', 'json');

  const abortController = new AbortController();
  const signal = AbortSignal.any([AbortSignal.timeout(5_000), abortController.signal]);
  let response: Response;
  try {
    response = await withAbort(fetchImpl(url, { signal, redirect: 'error' }), signal);
  } catch {
    throw new GeocodingFailure(signal.aborted ? 'timeout' : 'network');
  }

  if (response.status !== 200) {
    abortController.abort();
    throw new GeocodingFailure('status', response.status);
  }
  const mediaType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') {
    abortController.abort();
    throw new GeocodingFailure('content_type');
  }
  if (!response.body) throw new GeocodingFailure('invalid_json');

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await withAbort(reader.read(), signal);
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        abortController.abort();
        throw new GeocodingFailure('body_too_large');
      }
      chunks.push(value);
    }
  } catch (failure) {
    if (failure instanceof GeocodingFailure) throw failure;
    throw new GeocodingFailure(signal.aborted ? 'timeout' : 'network');
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new GeocodingFailure('invalid_json');
  }
}

async function withAbort<Value>(operation: Promise<Value>, signal: AbortSignal): Promise<Value> {
  if (signal.aborted) throw new GeocodingFailure('timeout');

  let onAbort = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new GeocodingFailure('timeout'));
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([operation, aborted]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}
