import { ApiError } from '../errors/api-error.js';

export function parseLocationQuery(rawUrl: string | undefined): string {
  if (rawUrl === undefined) return invalidQuery();

  let url: URL;
  try {
    url = new URL(rawUrl, 'http://localhost');
    decodeURIComponent(url.search);
  } catch {
    return invalidQuery();
  }

  if (url.searchParams.size !== 1 || !url.searchParams.has('query')) return invalidQuery();
  const query = url.searchParams.get('query');
  if (query === null) return invalidQuery();
  return canonicalizeLocationQuery(query);
}

export function canonicalizeLocationQuery(query: string): string {
  const normalized = query.normalize('NFKC');
  for (const character of normalized) {
    const firstCodeUnit = character.charCodeAt(0);
    if (firstCodeUnit < 32 || firstCodeUnit === 127) {
      return invalidQuery();
    }
  }

  const canonical = normalized.trim().replace(/\s+/gu, ' ');
  const length = [...canonical].length;
  if (length < 2 || length > 100) return invalidQuery();

  const segments = canonical.split(',');
  if (segments.length > 2 || segments.some((segment) => segment.trim().length === 0)) {
    return invalidQuery();
  }
  return canonical;
}

export function locationCacheKey(canonicalQuery: string): string {
  return `location-search:v1:${canonicalQuery.toLowerCase()}`;
}

function invalidQuery(): never {
  throw new ApiError('VALIDATION_ERROR');
}
