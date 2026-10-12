import { isIP } from 'node:net';
import envSchema, { type JSONSchemaType } from 'env-schema';

export type NodeEnvironment = 'development' | 'test' | 'production';
export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

export type AppConfig = Readonly<{
  nodeEnv: NodeEnvironment;
  host: string;
  port: number;
  logLevel: LogLevel;
  corsAllowedOrigins: readonly string[];
  trustProxy: false;
  apiRateLimitMax: number;
  apiRateLimitWindowMs: number;
  cacheMaxEntries: number;
  upstreamMaxConcurrency: number;
}>;

export type EnvironmentInput = Readonly<Record<string, string | undefined>>;

type RawEnvironmentConfig = {
  NODE_ENV: NodeEnvironment;
  HOST: string;
  PORT: number;
  LOG_LEVEL: LogLevel;
  CORS_ALLOWED_ORIGINS: string;
  TRUST_PROXY: boolean;
  API_RATE_LIMIT_MAX: number;
  API_RATE_LIMIT_WINDOW_MS: number;
  CACHE_MAX_ENTRIES: number;
  UPSTREAM_MAX_CONCURRENCY: number;
};

const ENVIRONMENT_SCHEMA: JSONSchemaType<RawEnvironmentConfig> = {
  type: 'object',
  required: [
    'NODE_ENV',
    'HOST',
    'PORT',
    'LOG_LEVEL',
    'CORS_ALLOWED_ORIGINS',
    'TRUST_PROXY',
    'API_RATE_LIMIT_MAX',
    'API_RATE_LIMIT_WINDOW_MS',
    'CACHE_MAX_ENTRIES',
    'UPSTREAM_MAX_CONCURRENCY',
  ],
  properties: {
    NODE_ENV: {
      type: 'string',
      enum: ['development', 'test', 'production'],
      default: 'development',
    },
    HOST: { type: 'string', minLength: 1, default: '127.0.0.1' },
    PORT: { type: 'integer', minimum: 1, maximum: 65_535, default: 3_000 },
    LOG_LEVEL: {
      type: 'string',
      enum: ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'],
      default: 'info',
    },
    CORS_ALLOWED_ORIGINS: {
      type: 'string',
      minLength: 1,
      default: 'http://localhost:5173',
    },
    TRUST_PROXY: { type: 'boolean', default: false },
    API_RATE_LIMIT_MAX: { type: 'integer', minimum: 1, default: 60 },
    API_RATE_LIMIT_WINDOW_MS: { type: 'integer', minimum: 1, default: 60_000 },
    CACHE_MAX_ENTRIES: { type: 'integer', minimum: 1, default: 1_000 },
    UPSTREAM_MAX_CONCURRENCY: { type: 'integer', minimum: 1, default: 10 },
  },
};

export function parseEnvironment(environment: EnvironmentInput): AppConfig {
  const parsed = envSchema<RawEnvironmentConfig>({
    schema: ENVIRONMENT_SCHEMA,
    data: { ...environment },
    env: false,
  });

  assertProxyTrustDisabled(parsed.TRUST_PROXY);
  assertProductionValuesAreExplicit(environment, parsed.NODE_ENV);

  if (
    parsed.NODE_ENV === 'production' &&
    parsed.CORS_ALLOWED_ORIGINS.split(',').some((origin) => origin.trim() === '*')
  ) {
    throw new Error('CORS_ALLOWED_ORIGINS cannot contain a wildcard in production');
  }

  const corsAllowedOrigins = parseCorsAllowedOrigins(parsed.CORS_ALLOWED_ORIGINS, parsed.NODE_ENV);

  return Object.freeze({
    nodeEnv: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    corsAllowedOrigins,
    trustProxy: false,
    apiRateLimitMax: parsed.API_RATE_LIMIT_MAX,
    apiRateLimitWindowMs: parsed.API_RATE_LIMIT_WINDOW_MS,
    cacheMaxEntries: parsed.CACHE_MAX_ENTRIES,
    upstreamMaxConcurrency: parsed.UPSTREAM_MAX_CONCURRENCY,
  });
}

function assertProxyTrustDisabled(trustProxy: boolean): void {
  if (trustProxy) {
    throw new Error('TRUST_PROXY must remain false until a proxy topology is approved');
  }
}

function assertProductionValuesAreExplicit(
  environment: EnvironmentInput,
  nodeEnvironment: NodeEnvironment,
): void {
  if (nodeEnvironment !== 'production') {
    return;
  }

  if (!hasNonBlankValue(environment, 'HOST')) {
    throw new Error('HOST must be explicitly configured in production');
  }

  if (!hasNonBlankValue(environment, 'CORS_ALLOWED_ORIGINS')) {
    throw new Error('CORS_ALLOWED_ORIGINS must be explicitly configured in production');
  }
}

function hasNonBlankValue(environment: EnvironmentInput, key: string): boolean {
  const value = environment[key];
  return typeof value === 'string' && value.trim().length > 0;
}

function parseCorsAllowedOrigins(
  rawOrigins: string,
  nodeEnvironment: NodeEnvironment,
): readonly string[] {
  const values = rawOrigins.split(',').map((origin) => origin.trim());
  if (values.some((origin) => origin.length === 0)) {
    throw invalidCorsOriginsError();
  }

  return Object.freeze(values.map((origin) => normalizeHttpOrigin(origin, nodeEnvironment)));
}

function normalizeHttpOrigin(origin: string, nodeEnvironment: NodeEnvironment): string {
  let parsed: URL;

  try {
    parsed = new URL(origin);
  } catch {
    throw invalidCorsOriginsError();
  }

  const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';
  const hasCredentials = parsed.username.length > 0 || parsed.password.length > 0;
  const hasResourcePath =
    parsed.pathname !== '/' || parsed.search.length > 0 || parsed.hash.length > 0;

  if (!isHttp || hasCredentials || hasResourcePath || parsed.origin === 'null') {
    throw invalidCorsOriginsError();
  }

  if (nodeEnvironment === 'production') {
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
    const isLoopback =
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.startsWith('127.') ||
      hostname === '[::1]';
    const isIpLiteral = isIP(hostname.replace(/^\[|\]$/g, '')) !== 0;

    if (parsed.protocol !== 'https:' || isLoopback || isIpLiteral) {
      throw new Error('CORS_ALLOWED_ORIGINS must contain only public HTTPS origins in production');
    }
  }

  return parsed.origin;
}

function invalidCorsOriginsError(): Error {
  return new Error('CORS_ALLOWED_ORIGINS must contain only comma-separated HTTP(S) origins');
}
