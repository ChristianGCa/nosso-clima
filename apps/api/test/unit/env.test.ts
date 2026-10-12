import { describe, expect, it } from 'vitest';

import { parseEnvironment } from '../../src/config/env.js';

const validProductionEnvironment = {
  NODE_ENV: 'production',
  HOST: '0.0.0.0',
  CORS_ALLOWED_ORIGINS: 'https://clima.example.com',
} as const;

describe('parseEnvironment', () => {
  it('applies safe development defaults', () => {
    const config = parseEnvironment({});

    expect(config).toEqual({
      nodeEnv: 'development',
      host: '127.0.0.1',
      port: 3000,
      logLevel: 'info',
      corsAllowedOrigins: ['http://localhost:5173'],
      trustProxy: false,
      apiRateLimitMax: 60,
      apiRateLimitWindowMs: 60_000,
      cacheMaxEntries: 1_000,
      upstreamMaxConcurrency: 10,
    });
  });

  it('coerces explicit values, normalizes origins and ignores unknown variables', () => {
    const config = parseEnvironment({
      NODE_ENV: 'test',
      HOST: 'localhost',
      PORT: '65535',
      LOG_LEVEL: 'debug',
      CORS_ALLOWED_ORIGINS: 'https://one.example.com/, http://localhost:4173',
      TRUST_PROXY: 'false',
      API_RATE_LIMIT_MAX: '75',
      API_RATE_LIMIT_WINDOW_MS: '30000',
      CACHE_MAX_ENTRIES: '250',
      UPSTREAM_MAX_CONCURRENCY: '4',
      UNKNOWN_APPLICATION_VALUE: 'ignored',
    });

    expect(config).toEqual({
      nodeEnv: 'test',
      host: 'localhost',
      port: 65_535,
      logLevel: 'debug',
      corsAllowedOrigins: ['https://one.example.com', 'http://localhost:4173'],
      trustProxy: false,
      apiRateLimitMax: 75,
      apiRateLimitWindowMs: 30_000,
      cacheMaxEntries: 250,
      upstreamMaxConcurrency: 4,
    });
    expect(config).not.toHaveProperty('UNKNOWN_APPLICATION_VALUE');
  });

  it('returns an immutable configuration and origin list', () => {
    const config = parseEnvironment({});

    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.corsAllowedOrigins)).toBe(true);
  });

  it('accepts an explicit production configuration', () => {
    const config = parseEnvironment(validProductionEnvironment);

    expect(config.nodeEnv).toBe('production');
    expect(config.host).toBe('0.0.0.0');
    expect(config.corsAllowedOrigins).toEqual(['https://clima.example.com']);
  });

  it.each([
    ['NODE_ENV', { NODE_ENV: 'staging' }],
    ['HOST', { HOST: '' }],
    ['PORT minimum', { PORT: '0' }],
    ['PORT maximum', { PORT: '65536' }],
    ['PORT integer', { PORT: '3.5' }],
    ['LOG_LEVEL', { LOG_LEVEL: 'verbose' }],
    ['CORS_ALLOWED_ORIGINS', { CORS_ALLOWED_ORIGINS: '' }],
    ['TRUST_PROXY coercion', { TRUST_PROXY: 'sometimes' }],
    ['API_RATE_LIMIT_MAX', { API_RATE_LIMIT_MAX: '0' }],
    ['API_RATE_LIMIT_WINDOW_MS', { API_RATE_LIMIT_WINDOW_MS: '0' }],
    ['CACHE_MAX_ENTRIES', { CACHE_MAX_ENTRIES: '0' }],
    ['UPSTREAM_MAX_CONCURRENCY', { UPSTREAM_MAX_CONCURRENCY: '0' }],
  ])('rejects an invalid %s value', (_caseName, environment) => {
    expect(() => parseEnvironment(environment)).toThrow();
  });

  it('rejects proxy trust until a deployment topology is approved', () => {
    expect(() => parseEnvironment({ TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY/);
  });

  it.each([
    ['malformed values', 'not an origin'],
    ['non-HTTP schemes', 'ftp://clima.example.com'],
    ['paths', 'https://clima.example.com/path'],
    ['empty list entries', 'https://clima.example.com,'],
  ])('rejects CORS origins with %s', (_caseName, origins) => {
    expect(() => parseEnvironment({ CORS_ALLOWED_ORIGINS: origins })).toThrow(
      /CORS_ALLOWED_ORIGINS/,
    );
  });

  it('requires HOST to be explicitly set in production', () => {
    expect(() =>
      parseEnvironment({
        NODE_ENV: 'production',
        CORS_ALLOWED_ORIGINS: 'https://clima.example.com',
      }),
    ).toThrow(/HOST/);
  });

  it('requires CORS_ALLOWED_ORIGINS to be explicitly set in production', () => {
    expect(() =>
      parseEnvironment({
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
      }),
    ).toThrow(/CORS_ALLOWED_ORIGINS/);
  });

  it('rejects wildcard CORS in production', () => {
    expect(() =>
      parseEnvironment({
        ...validProductionEnvironment,
        CORS_ALLOWED_ORIGINS: '*',
      }),
    ).toThrow(/CORS_ALLOWED_ORIGINS/);
  });

  it.each([
    ['HTTP', 'http://clima.example.com'],
    ['localhost', 'https://localhost:4173'],
    ['IPv4 loopback', 'https://127.0.0.1:4173'],
    ['IPv6 loopback', 'https://[::1]:4173'],
    ['private IPv4', 'https://10.0.0.1'],
    ['link-local IPv4', 'https://169.254.1.1'],
    ['public IPv4 literal', 'https://8.8.8.8'],
    ['private IPv6', 'https://[fd00::1]'],
  ])('rejects %s as a production CORS origin', (_caseName, origin) => {
    expect(() =>
      parseEnvironment({
        ...validProductionEnvironment,
        CORS_ALLOWED_ORIGINS: origin,
      }),
    ).toThrow(/CORS_ALLOWED_ORIGINS/);
  });
});
