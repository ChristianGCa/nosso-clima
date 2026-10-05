import type { EnvironmentInput } from './env.js';

export function assertServerlessCredentials(environment: EnvironmentInput): void {
  parseUpstashEndpoint(environment.UPSTASH_REDIS_REST_URL);
  assertUpstashToken(environment.UPSTASH_REDIS_REST_TOKEN);

  const hmacKey = environment.RATE_LIMIT_HMAC_KEY;
  if (!hmacKey || !/^[0-9a-f]{64}$/i.test(hmacKey)) {
    throw new Error('Invalid RATE_LIMIT_HMAC_KEY');
  }

  const cacheKey = environment.CACHE_HMAC_KEY;
  if (
    !cacheKey ||
    !/^[0-9a-f]{64}$/i.test(cacheKey) ||
    cacheKey.toLowerCase() === hmacKey.toLowerCase()
  ) {
    throw new Error('Invalid CACHE_HMAC_KEY');
  }
}

export function parseUpstashEndpoint(redisUrl: string | undefined): URL {
  if (!redisUrl || redisUrl !== redisUrl.trim()) {
    throw new Error('Invalid UPSTASH_REDIS_REST_URL');
  }

  let parsed: URL;
  try {
    parsed = new URL(redisUrl);
  } catch {
    throw new Error('Invalid UPSTASH_REDIS_REST_URL');
  }

  if (
    parsed.protocol !== 'https:' ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error('Invalid UPSTASH_REDIS_REST_URL');
  }

  return parsed;
}

export function assertUpstashToken(token: string | undefined): asserts token is string {
  if (!token || /\s/.test(token)) {
    throw new Error('Invalid UPSTASH_REDIS_REST_TOKEN');
  }
}
