import type { VisitorIdentity } from './visitor-identity.js';

export type VisitorGroup = 'location-search' | 'weather-forecast';

export const VISITOR_LIMITS = {
  global: 60,
  'location-search': 30,
  'weather-forecast': 15,
} as const;

type Counts = { global: number; 'location-search': number; 'weather-forecast': number };

export type VisitorPreLimit = Readonly<{
  check(identity: VisitorIdentity, group?: VisitorGroup): boolean;
  readonly size: number;
}>;

export function createVisitorPreLimit(
  options: Readonly<{ maxEntries?: number }> = {},
): VisitorPreLimit {
  const maxEntries = options.maxEntries ?? 2_048;
  if (!Number.isSafeInteger(maxEntries) || maxEntries <= 0) {
    throw new Error('Invalid pre-limit capacity');
  }
  const entries = new Map<string, Counts>();
  let activeBucket: number | undefined;

  return {
    check(identity, group) {
      if (identity.bucket !== activeBucket) {
        entries.clear();
        activeBucket = identity.bucket;
      }
      const counts = entries.get(identity.digest);
      if (!counts && entries.size >= maxEntries) return false;
      const current = counts ?? { global: 0, 'location-search': 0, 'weather-forecast': 0 };
      if (current.global >= VISITOR_LIMITS.global) return false;
      if (group && current[group] >= VISITOR_LIMITS[group]) return false;

      current.global += 1;
      if (group) current[group] += 1;
      entries.set(identity.digest, current);
      return true;
    },
    get size() {
      return entries.size;
    },
  };
}
