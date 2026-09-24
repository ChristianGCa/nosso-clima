export type RequestFailure = Readonly<{ kind: 'rate_limited' | 'unavailable'; requestId?: string }>;

export class ApiUnavailable extends Error {
  readonly failure: RequestFailure;

  constructor(failure: RequestFailure) {
    super('Request unavailable');
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
    throw new ApiUnavailable({ kind: 'unavailable' });
  }
  const supportId = requestId(response);
  if (!response.ok) {
    let kind: RequestFailure['kind'] = 'unavailable';
    if (response.status === 429) {
      const body: unknown = await response.json().catch(() => null);
      if (
        typeof body === 'object' &&
        body !== null &&
        'error' in body &&
        typeof body.error === 'object' &&
        body.error !== null &&
        'code' in body.error &&
        body.error.code === 'RATE_LIMITED'
      )
        kind = 'rate_limited';
    }
    throw new ApiUnavailable({ kind, ...(supportId ? { requestId: supportId } : {}) });
  }
  if (!/^application\/json\b/i.test(response.headers.get('content-type') ?? '')) {
    throw new ApiUnavailable({
      kind: 'unavailable',
      ...(supportId ? { requestId: supportId } : {}),
    });
  }
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new ApiUnavailable({
      kind: 'unavailable',
      ...(supportId ? { requestId: supportId } : {}),
    });
  }
}

export function unavailableFrom(error: unknown): ApiUnavailable {
  return error instanceof ApiUnavailable ? error : new ApiUnavailable({ kind: 'unavailable' });
}
