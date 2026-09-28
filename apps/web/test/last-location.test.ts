import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LAST_LOCATION_STORAGE_KEY,
  loadLastLocation,
  saveLastLocation,
} from '../src/storage/last-location';
import { locationResponse } from './fixtures';

const location = locationResponse.locations[0];

afterEach(() => vi.restoreAllMocks());

describe('last selected city', () => {
  it('round trips only a selected location', () => {
    saveLastLocation(location);
    expect(loadLastLocation()).toEqual(location);
    expect(JSON.parse(localStorage.getItem(LAST_LOCATION_STORAGE_KEY) ?? '')).toEqual({
      version: 1,
      location,
    });
  });

  it('ignores malformed, oversized, and invalid saved data', () => {
    for (const raw of [
      '{',
      'x'.repeat(2049),
      JSON.stringify({ version: 2, location }),
      JSON.stringify({ version: 1, location: { ...location, latitude: 999 } }),
      JSON.stringify({ version: 1, location: { ...location, timezone: 'Invalid/Zone' } }),
      JSON.stringify({ version: 1, location: { ...location, name: '<script>'.repeat(1000) } }),
    ]) {
      localStorage.setItem(LAST_LOCATION_STORAGE_KEY, raw);
      expect(loadLastLocation()).toBeNull();
    }
  });

  it('fails softly when browser storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'QuotaExceededError');
    });
    expect(loadLastLocation()).toBeNull();
    expect(() => saveLastLocation(location)).not.toThrow();
  });
});
