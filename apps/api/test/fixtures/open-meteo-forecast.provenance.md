# Open-Meteo forecast fixture provenance

- Equivalent source URL for retained fields: `https://api.open-meteo.com/v1/forecast?latitude=-23.548&longitude=-46.636&timezone=America%2FSao_Paulo&forecast_days=7&current=temperature_2m%2Capparent_temperature%2Cweather_code%2Cwind_speed_10m%2Cis_day&daily=weather_code%2Ctemperature_2m_max%2Ctemperature_2m_min%2Capparent_temperature_max%2Capparent_temperature_min%2Cprecipitation_probability_max%2Cprecipitation_sum%2Cwind_speed_10m_max&temperature_unit=celsius&wind_speed_unit=kmh&precipitation_unit=mm&timeformat=iso8601`
- Captured: 2026-09-23 (America/Sao_Paulo)
- Place: São Paulo, Brazil; request coordinates are rounded to three decimal places by the forecast query contract.
- The JSON file retains values from the captured provider response for the fields now consumed. Unused fields were pruned. Tests may clone it in memory for explicitly labelled malformed, missing and nullable-field cases; they must not mutate the committed baseline.
- The 2026-10-04 predominant-condition amendment adds `forecast-with-hourly.ts` as an **offline synthetic extension** of this retained baseline: it generates 24 hourly timestamps and repeated codes per day for integration tests. The added hourly arrays were not captured from Open-Meteo. Unit tests separately override them to prove predominance, ties and invalid-hour rejection.
