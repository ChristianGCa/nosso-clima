import { exact, finite, record, text, timezone } from './validation';
import { ApiUnavailable, requestJson, unavailableFrom } from './http';

export type Location = Readonly<{
  id: number;
  name: string;
  region: string | null;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  timezone: string;
}>;

export type LocationAttribution = Readonly<{
  providerUrl: string;
  sourceUrl: string;
  licenseUrl: string;
}>;

export type LocationSearch = Readonly<{
  locations: readonly Location[];
  attribution: LocationAttribution;
}>;

function region(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error('invalid data');
  return value;
}

export function parseLocations(value: unknown): LocationSearch {
  const root = record(value);
  if (!Array.isArray(root.locations) || root.locations.length > 5) throw new Error('invalid data');
  const locations = root.locations.map((raw): Location => {
    const item = record(raw);
    const countryCode = text(item.countryCode);
    if (!/^[A-Z]{2}$/.test(countryCode)) throw new Error('invalid data');
    const id = finite(item.id, 1, Number.MAX_SAFE_INTEGER);
    if (!Number.isInteger(id)) throw new Error('invalid data');
    return {
      id,
      name: text(item.name),
      region: region(item.region),
      country: text(item.country),
      countryCode,
      latitude: finite(item.latitude, -90, 90),
      longitude: finite(item.longitude, -180, 180),
      timezone: timezone(item.timezone),
    };
  });
  const credit = record(root.attribution);
  exact(credit.provider, 'Open-Meteo');
  exact(credit.source, 'GeoNames');
  exact(credit.license, 'CC BY 4.0');
  exact(credit.isModified, true);
  return {
    locations,
    attribution: {
      providerUrl: exact(credit.providerUrl, 'https://open-meteo.com/'),
      sourceUrl: exact(credit.sourceUrl, 'https://www.geonames.org/'),
      licenseUrl: exact(credit.licenseUrl, 'https://creativecommons.org/licenses/by/4.0/'),
    },
  };
}

export async function searchLocations(
  query: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<LocationSearch> {
  const params = new URLSearchParams({ query });
  try {
    return parseLocations(await requestJson(`/api/v1/locations?${params}`, signal, fetchImpl));
  } catch (error) {
    throw unavailableFrom(error);
  }
}

export { ApiUnavailable };
