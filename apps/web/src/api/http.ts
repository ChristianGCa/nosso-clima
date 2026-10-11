import { resolveApiBaseUrl } from './base-url';

export type RequestFailure = Readonly<{
  kind: 'rate_limited' | 'unavailable' | 'request_failed';
  requestId?: string;
}>;

export class ApiRequestError extends Error {
  readonly failure: RequestFailure;

  constructor(failure: RequestFailure) {
    super('Request failed');
    this.failure = failure;
  }
}

const REQUEST_TIMEOUT_MS = 10_000;

function requestId(response: Response): string | undefined {
  const value = response.headers.get('x-request-id');
  return value && /^[\w-]{1,100}$/.test(value) ? value : undefined;
}

export async function requestJson(
  path: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
  const requestSignal = AbortSignal.any([signal, timeoutController.signal]);
  try {
    let response: Response;
    try {
      const base = resolveApiBaseUrl(
        import.meta.env.VITE_API_BASE_URL,
        import.meta.env.PROD,
        globalThis.location?.origin,
      );
      response = await fetchImpl(`${base}${path}`, {
        signal: requestSignal,
        headers: { accept: 'application/json' },
      });
    } catch {
      throw new ApiRequestError({ kind: 'unavailable' });
    }
    const supportId = requestId(response);
    if (!response.ok) {
      let kind: RequestFailure['kind'] = 'request_failed';
      if (response.status === 429) {
        kind = 'rate_limited';
      } else if (response.status === 503) {
        const body: unknown = await response.json().catch(() => null);
        if (
          typeof body === 'object' &&
          body !== null &&
          'error' in body &&
          typeof body.error === 'object' &&
          body.error !== null &&
          'code' in body.error &&
          body.error.code === 'SERVICE_UNAVAILABLE'
        ) {
          kind = 'unavailable';
        }
      }
      throw new ApiRequestError({ kind, ...(supportId ? { requestId: supportId } : {}) });
    }
    if (!/^application\/json\b/i.test(response.headers.get('content-type') ?? '')) {
      throw new ApiRequestError({
        kind: 'unavailable',
        ...(supportId ? { requestId: supportId } : {}),
      });
    }
    try {
      return (await response.json()) as unknown;
    } catch {
      throw new ApiRequestError({
        kind: 'unavailable',
        ...(supportId ? { requestId: supportId } : {}),
      });
    }
  } finally {
    clearTimeout(timeout);
  }
}

export function requestErrorFrom(error: unknown): ApiRequestError {
  return error instanceof ApiRequestError ? error : new ApiRequestError({ kind: 'unavailable' });
}
