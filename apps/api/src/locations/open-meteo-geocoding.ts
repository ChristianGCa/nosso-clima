import type { Location } from './location-contract.js';

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
const PUBLIC_TEXT_LIMIT = 256;
const COUNTRY_CODE = /^[A-Z]{2}$/u;
const POPULATED_PLACE_CODES = new Set([
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
]);

export type GeocodingClient = Readonly<{
  search(query: string): Promise<readonly Location[]>;
}>;

export function createOpenMeteoGeocodingClient(fetchImpl: typeof fetch = fetch): GeocodingClient {
  return {
    async search(query) {
      return normalizeGeocodingResponse(await fetchGeocodingJson(query, fetchImpl));
    },
  };
}

export function normalizeGeocodingResponse(payload: unknown): readonly Location[] {
  if (!isObject(payload)) throw new GeocodingFailure('invalid_response');
  if (!Object.hasOwn(payload, 'results')) return [];
  if (!Array.isArray(payload.results) || payload.results.length > 10) {
    throw new GeocodingFailure('invalid_response');
  }

  const locations: Location[] = [];
  const seenIds = new Set<number>();
  for (const candidate of payload.results) {
    if (!isObject(candidate)) throw new GeocodingFailure('invalid_response');
    const featureCode = readText(candidate.feature_code);
    if (!POPULATED_PLACE_CODES.has(featureCode)) continue;

    const id = candidate.id;
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) {
      throw new GeocodingFailure('invalid_response');
    }
    const name = readText(candidate.name);
    const country = readText(candidate.country);
    const countryCode = readText(candidate.country_code);
    const timezone = readText(candidate.timezone);
    if (!COUNTRY_CODE.test(countryCode) || !isRuntimeTimeZone(timezone)) {
      throw new GeocodingFailure('invalid_response');
    }
    const latitude = readCoordinate(candidate.latitude, -90, 90);
    const longitude = readCoordinate(candidate.longitude, -180, 180);
    const region =
      candidate.admin1 === undefined || candidate.admin1 === ''
        ? null
        : readText(candidate.admin1, true) || null;

    if (!seenIds.has(id)) {
      seenIds.add(id);
      if (locations.length < 5) {
        locations.push({ id, name, region, country, countryCode, latitude, longitude, timezone });
      }
    }
  }
  return locations;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readText(value: unknown, allowEmpty = false): string {
  if (
    typeof value !== 'string' ||
    [...value].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
    })
  ) {
    throw new GeocodingFailure('invalid_response');
  }
  const text = value.trim();
  if ((!allowEmpty && text.length === 0) || [...text].length > PUBLIC_TEXT_LIMIT) {
    throw new GeocodingFailure('invalid_response');
  }
  return text;
}

function readCoordinate(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new GeocodingFailure('invalid_response');
  }
  return value;
}

function isRuntimeTimeZone(value: string): boolean {
  // Intl also accepts numeric UTC offsets; this API contract requires an IANA identifier.
  if (value.startsWith('+') || value.startsWith('-')) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

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
