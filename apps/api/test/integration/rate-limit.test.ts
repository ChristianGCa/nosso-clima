import { Writable } from 'node:stream';

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../src/app.js';
import { parseEnvironment } from '../../src/config/env.js';

let app: FastifyInstance | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  await app?.close();
  app = undefined;
});

describe('inbound rate limiting', () => {
  it('accepts sixty global requests and rejects the next with stable error and retry headers', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 8, 22, 12));
    const logCapture = createLogCapture();
    app = buildApp({
      logger: {
        level: 'info',
        stream: logCapture.stream,
      },
    });

    const acceptedResponses = await Promise.all(
      Array.from({ length: 60 }, () => app?.inject({ method: 'GET', url: '/health' })),
    );
    const rejectedResponse = await app.inject({ method: 'GET', url: '/health' });

    expect(acceptedResponses).toHaveLength(60);
    expect(acceptedResponses.every((response) => response?.statusCode === 200)).toBe(true);
    expect(rejectedResponse.statusCode).toBe(429);
    expect(rejectedResponse.headers['x-ratelimit-limit']).toBe('60');
    expect(rejectedResponse.headers['x-ratelimit-remaining']).toBe('0');
    expect(rejectedResponse.headers['x-ratelimit-reset']).toBe('60');
    expect(rejectedResponse.headers['retry-after']).toBe('60');
    expect(rejectedResponse.json()).toEqual({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests',
        requestId: rejectedResponse.headers['x-request-id'],
      },
    });

    expect(readLogRecords(logCapture.readText())).toContainEqual(
      expect.objectContaining({
        event: 'rate_limit_rejected',
        requestId: rejectedResponse.headers['x-request-id'],
        scope: 'global',
      }),
    );
  });

  it('resets the global counter when its configured window expires', async () => {
    let now = Date.UTC(2026, 8, 22, 12);
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const config = parseEnvironment({
      API_RATE_LIMIT_MAX: '2',
      API_RATE_LIMIT_WINDOW_MS: '1000',
    });
    app = buildApp({ config });

    const firstResponse = await app.inject({ method: 'GET', url: '/health' });
    const secondResponse = await app.inject({ method: 'GET', url: '/health' });
    const rejectedResponse = await app.inject({ method: 'GET', url: '/health' });

    now += 1_000;
    const resetResponse = await app.inject({ method: 'GET', url: '/health' });

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);
    expect(rejectedResponse.statusCode).toBe(429);
    expect(resetResponse.statusCode).toBe(200);
    expect(resetResponse.headers['x-ratelimit-remaining']).toBe('1');
  });
});

type LogCapture = Readonly<{
  stream: Writable;
  readText: () => string;
}>;

function createLogCapture(): LogCapture {
  let output = '';
  const stream = new Writable({
    write(chunk: unknown, _encoding, callback): void {
      output += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      callback();
    },
  });

  return {
    stream,
    readText: () => output,
  };
}

function readLogRecords(logText: string): readonly Record<string, unknown>[] {
  return logText
    .trim()
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line): unknown => JSON.parse(line))
    .map((value) => {
      if (!isRecord(value)) {
        throw new Error('Expected every log line to contain a JSON object');
      }

      return value;
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
