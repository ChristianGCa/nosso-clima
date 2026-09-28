import { parseLocation, type Location } from '../api/locations';
import { record } from '../api/validation';

export const LAST_LOCATION_STORAGE_KEY = 'nosso-clima:last-location:v1';
const MAX_STORED_LENGTH = 2048;

export function loadLastLocation(): Location | null {
  try {
    const raw = window.localStorage.getItem(LAST_LOCATION_STORAGE_KEY);
    if (!raw || raw.length > MAX_STORED_LENGTH) return null;
    const saved = record(JSON.parse(raw) as unknown);
    if (saved.version !== 1) return null;
    return parseLocation(saved.location);
  } catch {
    return null;
  }
}

export function saveLastLocation(location: Location): void {
  try {
    const value = JSON.stringify({ version: 1, location });
    if (value.length <= MAX_STORED_LENGTH)
      window.localStorage.setItem(LAST_LOCATION_STORAGE_KEY, value);
  } catch {
    // Browser storage can be disabled or full; the current forecast still works.
    return;
  }
}
