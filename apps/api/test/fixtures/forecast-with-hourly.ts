import capturedForecast from './open-meteo-forecast.json' with { type: 'json' };

const hours = Array.from({ length: 24 }, (_, hour) => hour);

// Synthetic hourly data extends the retained 2026-09-23 provider fixture for offline tests.
// It is not represented as a newly captured Open-Meteo response. Temperatures rise linearly
// from each day's minimum to its maximum; a rainy day's precipitation falls in its first two
// hours; daytime runs from 06h to 17h. Hourly sums are not required to match daily totals.
export const forecastWithHourly = {
  ...capturedForecast,
  hourly_units: {
    time: 'iso8601',
    weather_code: 'wmo code',
    temperature_2m: '°C',
    precipitation: 'mm',
    is_day: '',
  },
  hourly: {
    time: capturedForecast.daily.time.flatMap((date) =>
      hours.map((hour) => `${date}T${String(hour).padStart(2, '0')}:00`),
    ),
    weather_code: capturedForecast.daily.weather_code.flatMap((code) => Array(24).fill(code)),
    temperature_2m: capturedForecast.daily.temperature_2m_min.flatMap((minimum, day) => {
      const maximum = capturedForecast.daily.temperature_2m_max[day] ?? minimum;
      return hours.map(
        (hour) => Math.round((minimum + ((maximum - minimum) * hour) / 23) * 10) / 10,
      );
    }),
    precipitation: capturedForecast.daily.precipitation_sum.flatMap((total) =>
      hours.map((hour) => (hour < 2 ? Math.round((total / 2) * 10) / 10 : 0)),
    ),
    is_day: capturedForecast.daily.time.flatMap(() =>
      hours.map((hour) => (hour >= 6 && hour < 18 ? 1 : 0)),
    ),
  },
};
