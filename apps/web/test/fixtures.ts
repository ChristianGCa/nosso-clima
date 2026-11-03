export const locationResponse = {
  locations: [
    {
      id: 3448439,
      name: 'São Paulo',
      region: 'São Paulo',
      country: 'Brasil',
      countryCode: 'BR',
      latitude: -23.548,
      longitude: -46.636,
      timezone: 'America/Sao_Paulo',
    },
  ],
  attribution: {
    provider: 'Open-Meteo',
    source: 'GeoNames',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    isModified: true,
    providerUrl: 'https://open-meteo.com/',
    sourceUrl: 'https://www.geonames.org/',
  },
} as const;

const clear = { code: 0, category: 'clear', labelPt: 'Limpo' } as const;
const hours = Array.from({ length: 24 }, (_, hour) => hour);

/** Synthetic hourly columns: today's 16h temperature and the next day's 3h rain are unavailable. */
function hourlyFor(dayIndex: number) {
  return {
    temperatureC: hours.map((hour) => (dayIndex === 0 && hour === 16 ? null : 15 + hour / 2)),
    precipitationMm: hours.map((hour) =>
      dayIndex === 1 && hour === 3 ? null : hour === 17 ? 0.4 : 0,
    ),
  };
}

export const forecastResponse = {
  timezone: 'America/Sao_Paulo',
  retrievedAtUtc: '2026-09-24T18:32:00.000Z',
  current: {
    validAtLocal: '2026-09-24T15:30',
    temperatureC: 23.4,
    apparentTemperatureC: 24.1,
    condition: clear,
    windSpeedKmh: 12.8,
    isDay: true,
  },
  daily: Array.from({ length: 7 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 8, 24 + index)).toISOString().slice(0, 10),
    temperatureMaxC: 26 + index,
    temperatureMinC: 15,
    apparentTemperatureMaxC: 27,
    apparentTemperatureMinC: 14,
    condition: clear,
    precipitationProbabilityMaxPercent: index === 0 ? null : 70,
    precipitationSumMm: index === 0 ? 0 : 8.4,
    windSpeedMaxKmh: 25,
    hourly: hourlyFor(index),
  })),
  attribution: {
    provider: 'Open-Meteo',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    isModified: true,
    providerUrl: 'https://open-meteo.com/',
  },
} as const;

export function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', 'x-request-id': 'test-request-1' },
  });
}
