import { Writable } from 'node:stream';

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../src/app.js';

let app: FastifyInstance | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  await app?.close();
  app = undefined;
});

describe('GET /health', () => {
  it('returns only process health without external I/O', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    app = buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.json()).toEqual({ status: 'ok' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('generates response IDs and emits only allowlisted completion fields', async () => {
    const logCapture = createLogCapture();
    app = buildApp({
      logger: {
        level: 'info',
        stream: logCapture.stream,
      },
    });

    const healthResponse = await app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        'request-id': 'client-controlled-id',
      },
    });
    const missingResponse = await app.inject({
      method: 'POST',
      url: '/missing?search=private-city&latitude=-23.5505&longitude=-46.6333',
      headers: {
        'content-type': 'application/json',
        'request-id': 'another-client-id',
        'x-cache-key': 'private-cache-key',
        'x-forwarded-for': '203.0.113.42',
      },
      payload: {
        privateBody: 'do-not-log',
      },
    });

    const healthRequestId = healthResponse.headers['x-request-id'];
    const missingRequestId = missingResponse.headers['x-request-id'];

    expect(healthRequestId).toEqual(expect.any(String));
    expect(missingRequestId).toEqual(expect.any(String));
    expect(healthRequestId).not.toBe('client-controlled-id');
    expect(missingRequestId).not.toBe('another-client-id');
    expect(missingRequestId).not.toBe(healthRequestId);

    const logText = logCapture.readText();
    expect(logText).not.toContain('private-city');
    expect(logText).not.toContain('-23.5505');
    expect(logText).not.toContain('-46.6333');
    expect(logText).not.toContain('203.0.113.42');
    expect(logText).not.toContain('private-cache-key');
    expect(logText).not.toContain('do-not-log');
    expect(logText).not.toContain('client-controlled-id');
    expect(logText).not.toContain('another-client-id');
    expect(logText).not.toContain('"req":');
    expect(logText).not.toContain('"res":');
    expect(logText).not.toContain('"url":');
    expect(logText).not.toContain('"query":');
    expect(logText).not.toContain('"body":');
    expect(logText).not.toContain('"cacheKey":');

    expect(readLogRecords(logText)).toEqual([
      expect.objectContaining({
        event: 'request_completed',
        requestId: healthRequestId,
        method: 'GET',
        route: '/health',
        statusCode: 200,
        durationMs: expect.any(Number),
      }),
      expect.objectContaining({
        event: 'request_completed',
        requestId: missingRequestId,
        method: 'POST',
        route: 'unmatched',
        statusCode: 404,
        durationMs: expect.any(Number),
      }),
    ]);
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
