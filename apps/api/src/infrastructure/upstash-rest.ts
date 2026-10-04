import { assertUpstashToken, parseUpstashEndpoint } from '../config/serverless-credentials.js';

const RESPONSE_LIMIT_BYTES = 65_536;
const REQUEST_TIMEOUT_MS = 2_000;

export class UpstashUnavailable extends Error {
  constructor() {
    super('Redis unavailable');
    this.name = 'UpstashUnavailable';
  }
}

export type UpstashRestClient = Readonly<{
  eval(script: string, keys: readonly string[], args: readonly string[]): Promise<unknown>;
}>;

export function createUpstashRestClient(options: {
  endpoint: string;
  token: string;
  fetchImpl?: typeof fetch;
}): UpstashRestClient {
  let endpoint: URL;
  try {
    endpoint = parseUpstashEndpoint(options.endpoint);
    assertUpstashToken(options.token);
  } catch {
    throw new Error('Invalid Upstash transport configuration');
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    async eval(script, keys, args) {
      const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      try {
        const response = await withAbort(
          fetchImpl(endpoint, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${options.token}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify(['EVAL', script, keys.length, ...keys, ...args]),
            redirect: 'error',
            signal,
          }),
          signal,
        );
        if (response.status !== 200 || !response.body) throw new UpstashUnavailable();

        const bytes = await readBoundedBody(response.body, signal);
        const payload: unknown = JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(bytes),
        );
        if (
          typeof payload !== 'object' ||
          payload === null ||
          !Object.hasOwn(payload, 'result') ||
          Object.hasOwn(payload, 'error')
        ) {
          throw new UpstashUnavailable();
        }
        return (payload as { result: unknown }).result;
      } catch {
        throw new UpstashUnavailable();
      }
    },
  };
}

async function readBoundedBody(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await withAbort(reader.read(), signal);
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > RESPONSE_LIMIT_BYTES) {
        await reader.cancel();
        throw new UpstashUnavailable();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function withAbort<Value>(operation: Promise<Value>, signal: AbortSignal): Promise<Value> {
  if (signal.aborted) throw new UpstashUnavailable();

  let onAbort = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new UpstashUnavailable());
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([operation, aborted]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}
