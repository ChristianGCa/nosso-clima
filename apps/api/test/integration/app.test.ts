import { Writable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { type BackendPlatformContext, buildApp } from '../../src/app.js';
import { parseEnvironment } from '../../src/config/env.js';

describe('buildApp', () => {
  it('readies and closes an injectable app without opening a network port', async () => {
    const app = buildApp();

    try {
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/not-registered',
      });

      expect(response.statusCode).toBe(404);
      expect(app.server.listening).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('passes configured bounded primitives to provider route registration', async () => {
    const config = parseEnvironment({ CACHE_MAX_ENTRIES: '1', UPSTREAM_MAX_CONCURRENCY: '1' });
    let context: BackendPlatformContext | undefined;
    const app = buildApp({
      config,
      registerRoutes(_app, resources) {
        context = resources;
      },
    });
    try {
      await app.ready();
      expect(context?.config).toBe(config);
      const cache = context?.createCache<number>('location-search');
      cache?.set('first', 1, { ttlMs: 1000 });
      cache?.set('second', 2, { ttlMs: 1000 });
      expect(cache?.get('first')).toBeUndefined();
      expect(cache?.get('second')).toBe(2);
      expect(() => context?.createCache<number>('location-search')).toThrow(/already initialized/);
      expect(context?.singleFlight).toBeDefined();
      expect(context?.executor).toBeDefined();
      const first = Promise.withResolvers<void>();
      const running = context?.executor.run(() => first.promise);
      const queued = context?.executor.run(async () => 'queued');
      const saturation = context?.executor.run(async () => 'excess');
      await expect(saturation).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
      first.resolve();
      await running;
      await expect(queued).resolves.toBe('queued');
    } finally {
      await app.close();
    }
  });

  it('records cache outcomes with one request ID and no cache key at info level', async () => {
    let logText = '';
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        logText += String(chunk);
        callback();
      },
    });
    const app = buildApp({
      logger: { level: 'info', stream },
      registerRoutes(testApp, platform) {
        const cache = platform.createCache<number>('location-search');
        testApp.get('/test/cache', (request) => {
          const value = cache.get('private-location-key', request.log);
          if (value === undefined) cache.set('private-location-key', 1, { ttlMs: 1000 });
          return { value: value ?? 1 };
        });
      },
    });
    try {
      const first = await app.inject({ method: 'GET', url: '/test/cache' });
      const second = await app.inject({ method: 'GET', url: '/test/cache' });
      const cacheRecords = logText
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>)
        .filter((record) => record.event === 'cache_miss' || record.event === 'cache_hit');
      expect(cacheRecords.map((record) => record.event)).toEqual(['cache_miss', 'cache_hit']);
      expect(cacheRecords.map((record) => record.requestId)).toEqual([
        first.headers['x-request-id'],
        second.headers['x-request-id'],
      ]);
      expect(logText).not.toContain('private-location-key');
      expect(
        logText
          .trim()
          .split('\n')
          .every((line) => (line.match(/"requestId":/g) ?? []).length === 1),
      ).toBe(true);
    } finally {
      await app.close();
    }
  });
});
