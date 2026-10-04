import capturedForecast from './open-meteo-forecast.json' with { type: 'json' };

// Synthetic hourly data extends the retained 2026-09-23 provider fixture for offline tests.
// It is not represented as a newly captured Open-Meteo response.
export const forecastWithHourly = {
  ...capturedForecast,
  hourly_units: { time: 'iso8601', weather_code: 'wmo code' },
  hourly: {
    time: capturedForecast.daily.time.flatMap((date) =>
      Array.from({ length: 24 }, (_, hour) => `${date}T${String(hour).padStart(2, '0')}:00`),
    ),
    weather_code: capturedForecast.daily.weather_code.flatMap((code) => Array(24).fill(code)),
  },
};
