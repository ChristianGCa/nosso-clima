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

function requestId(response: Response): string | undefined {
  const value = response.headers.get('x-request-id');
  return value && /^[\w-]{1,100}$/.test(value) ? value : undefined;
}

export async function requestJson(
  path: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  let response: Response;
  try {
    const base = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? '';
    response = await fetchImpl(`${base}${path}`, {
      signal,
      headers: { accept: 'application/json' },
    });
  } catch {
    throw new ApiRequestError({ kind: 'unavailable' });
  }
  const supportId = requestId(response);
  if (!response.ok) {
    let kind: RequestFailure['kind'] = 'request_failed';
    if (response.status === 429 || response.status === 503) {
      const body: unknown = await response.json().catch(() => null);
      if (
        typeof body === 'object' &&
        body !== null &&
        'error' in body &&
        typeof body.error === 'object' &&
        body.error !== null &&
        'code' in body.error &&
        ((response.status === 429 && body.error.code === 'RATE_LIMITED') ||
          (response.status === 503 && body.error.code === 'SERVICE_UNAVAILABLE'))
      ) {
        kind = response.status === 429 ? 'rate_limited' : 'unavailable';
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
}

export function requestErrorFrom(error: unknown): ApiRequestError {
  return error instanceof ApiRequestError ? error : new ApiRequestError({ kind: 'unavailable' });
}
