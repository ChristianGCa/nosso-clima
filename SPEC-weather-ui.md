# Spec: Weather UI

- **Status:** Complete; Checkpoint U-C approved by owner on 2026-09-24; revised by owner request on 2026-09-28 to remove UV maximum and risk
- **Module id:** `weather-ui`
- **Depends on:** `location-search`, `weather-forecast`
- **Consumer:** `production-delivery`

## Objective

Build a responsive Portuguese-language site where a person searches for a city, explicitly selects one result, and understands its current conditions and seven-day forecast. The interface must make the city, local times, units, uncertainty and unavailable metrics clear without requiring weather expertise. It consumes the two approved backend HTTP contracts and does not interpret raw Open-Meteo responses or WMO codes.

The first screen is neutral: no default city, geolocation request, saved selection or forecast request. The person may type a place name and choose a result that shows city, region when available, and country. A new selection loads that place's forecast. The site does not add accounts, history, maps, alerts, hourly weather, unit switching or weather advice.

## User Flow and States

1. Show the app title, a labelled city search field, short guidance, and a neutral background. Do not request either API on first load.
2. After the trimmed input reaches three Unicode code points, wait 300 ms after the last edit, then request `GET /api/v1/locations?query=...`. A shorter input clears suggestions and makes no request. The backend may accept two-character searches; the three-character threshold is a UI choice.
3. Show at most five results with city, region if present, and country. Never silently choose the first result. A zero-result response has a distinct message from a loading or error state.
4. Selecting a result closes suggestions and requests `GET /api/v1/forecast` using only that result's `latitude`, `longitude` and `timezone`. Clear the prior forecast and return to a neutral background while a newly selected city's forecast loads; never display one city's forecast beneath another city's name.
5. On success, show the selected place, current conditions, one detailed card for today and six compact daily summaries. The person can search again while a forecast is visible; editing search text alone does not change the selected place or its forecast.
6. On forecast failure, keep the selected place visible with a concise error and an explicit retry action. Do not automatically retry or show stale data from a different city. A search failure leaves an already displayed forecast in place.

Every request has an `AbortController`. On a new query or selected place, abort the old request and also ignore any late result that belongs to an older request, since abort is not proof that a response cannot arrive. Unmounting the view aborts outstanding work. Treat non-2xx, malformed JSON and unexpected response shapes as an unavailable state; never render unchecked values. No client cache or persistence is required for the MVP.

For rate limiting, show a specific friendly message for `429 RATE_LIMITED` and allow a later manual retry. For `503 SERVICE_UNAVAILABLE`, network failure or malformed data, show a generic temporary-unavailability message. Do not display provider bodies, raw server diagnostics or coordinates in an error. Other errors use a generic failure state. Preserve the backend's request ID only as a support reference in the error state, if present.

## Backend Contracts and Presentation

The frontend calls the same configured API base URL for both routes and uses `URLSearchParams` for query values. The base URL comes from build configuration, never from a search term or server response. Development may use a Vite proxy; production origin and CORS configuration belong to `production-delivery`.

| UI need | Provider contract | Presentation rule |
|---|---|---|
| Search suggestions | `GET /api/v1/locations` from `SPEC-location-search.md` | Show `name`, optional `region`, and `country`; use the complete selected result for the forecast request. |
| Current conditions | `GET /api/v1/forecast` from `SPEC-weather-forecast.md` | Show current temperature, apparent temperature, condition label, wind speed and local valid time. |
| Seven-day forecast | `daily` from forecast response | Show local date and weekday for all seven days. Today shows max/min temperature and apparent temperature, the day's **most severe** condition, maximum rain chance, rain amount and maximum wind. Each of the next six days shows only its condition, maximum rain chance, rain amount and max/min temperature. |
| Attribution | Each response's `attribution` | Credit Open-Meteo, GeoNames for search results and the selected city, linked CC BY 4.0 licence, and say Nosso Clima adapted the data. |

The idea document's phrase “condição predominante” is superseded by the approved forecast contract: `daily.weather_code` represents the most severe condition of the day. Do not compute a predominant condition or derive daily conditions from the current condition. Backend `condition.category` and `condition.labelPt` are authoritative for wording and visual grouping.

Use `pt-BR` number and date formatting. Show °C, km/h, mm and percent explicitly. Distinguish rain chance (%) and rain amount (mm) with different icons and units, and keep their full names available to assistive technology so `70%` is not mistaken for `8,4 mm`. Maximum and minimum temperatures may use distinct upward and downward icons when their names remain available to assistive technology. A `null` daily precipitation probability is shown as “Indisponível”; never substitute zero.

`current.validAtLocal` is an offset-less local minute in the returned `timezone`; display its clock time directly and identify it as the time the current conditions apply to. Do not parse it as UTC or call it an observed measurement. `retrievedAtUtc` is a distinct retrieval timestamp; format it in the returned timezone and label it “Dados consultados às …”. For daily `YYYY-MM-DD`, calculate weekday from that civil date without shifting it through the browser's local timezone. The site must behave the same when the viewer and selected city are in different timezones.

Keep frontend response types and runtime checks within `apps/web`. Do not import runtime code from `apps/api` or modify provider contracts here. The HTTP boundary treats JSON as `unknown` and accepts only the consumed documented shape; invalid data moves the affected request to an error state.

## Layout, Backgrounds and Accessibility

The visual hierarchy is search first, current conditions second, seven-day forecast third, and source credit adjacent to the data it credits. The owner's 2026-09-27 wireframe defines the organization: a compact header with search, current conditions, a seven-day forecast, then attribution and brief site information. Its blue, cyan and red fills only separate sections in the sketch; they are not the product palette. Keep the selected weather photograph visible behind neutral, readable surfaces. Use distinct multicolor weather icons. Mark the first, detailed daily card visibly as “HOJE” and keep each later day's condition, icon and metrics together. Daily cards share the same height at each viewport width, with enough space and subtle dividers between temperatures, rain chance and rain volume. At 360 px the page has no horizontal overflow, search suggestions remain usable, and all seven days form a compact readable vertical list. Mobile layouts should minimize vertical scrolling without clipping weather data; wider layouts may show the seven days side by side with more detail for today. Loading, empty and error states reserve enough space to avoid disruptive layout shifts.

Use one decorative WebP background from the ten existing `backgrounds/` files, selected solely by `current.condition.category` and `current.isDay`. The initial and loading states use a neutral solid or gradient background. Map the five categories to their matching `dia-*` or `noite-*` file; if an image fails to load, use the neutral background. Do not request all ten images on first load or use a daily condition to choose the current background. During implementation, place the files under the web app's asset directory without changing their names, and load only the active image in the browser.

Text and controls sit on opaque or sufficiently strong translucent surfaces, never directly on the photograph. Verify contrast on every day/night image and on the neutral state at mobile and desktop sizes; meet at least 4.5:1 for ordinary text and 3:1 for large text and interactive boundaries. The image is decorative and has no alternative text. Ensure focus indicators remain visible against every background. Respect reduced-motion preferences; motion cannot carry essential state.

The city picker has a persistent accessible name without a separate visible label and supports keyboard operation: Tab reaches the field and suggestions, arrow keys move the active suggestion, Enter selects it, Escape closes the list, and focus is never trapped. Search feedback, suggestions and search attribution appear in a panel anchored below the field without changing the header height. The current active option and result count are exposed to assistive technology without announcing every keystroke. Loading and error messages use appropriate live announcements; retry and attribution links have discernible names. An empty result is distinguishable from a transport error. Color alone never identifies weather.

## Tech Stack and Commands

The proposed frontend is a separate `@nosso-clima/web` npm workspace using React, Vite and strict TypeScript, as recorded in `docs/ideas/nosso-clima.md`. Use native `fetch`, `AbortController` and `Intl`; no client state or HTTP library is proposed. Vitest and React Testing Library cover state and component behavior. A browser-based axe check supplies the active `npm run test:a11y` gate. Pin exact supported dependency versions in the lockfile during the approved bootstrap; this draft does not install dependencies.

The web workspace must provide these commands when implemented:

```bash
npm run dev --workspace @nosso-clima/web
npm run build --workspace @nosso-clima/web
npm run typecheck --workspace @nosso-clima/web
npm run lint --workspace @nosso-clima/web
npm run format:check --workspace @nosso-clima/web
npm test --workspace @nosso-clima/web
npm run test:coverage --workspace @nosso-clima/web
npm run test:a11y
npm run check:boundaries
```

The canonical root `npm run check` must still pass. A web-local `check` command should run typecheck, lint, format, tests and build. The web application must meet the existing 80% floor for statements, branches, functions and lines. Keep local checks under 90 seconds; browser accessibility checks may use the five-minute end-of-task/CI budget. `production-delivery` owns full end-to-end, Lighthouse and deployment checks.

## Project Structure

```text
SPEC-weather-ui.md
apps/web/package.json
apps/web/index.html
apps/web/src/                  application, components, local HTTP contracts and formatting
apps/web/src/assets/backgrounds/ ten existing WebP files, moved from backgrounds/
apps/web/test/                 unit and component tests with offline HTTP fixtures
```

Exact component boundaries are chosen in the implementation plan after this spec is approved. The frontend and backend build independently. The boundary check must reject imports from `apps/web` into `apps/api/src` and the reverse.

## Code Style

Use named exports, kebab-case file names, typed component props, immutable response models and explicit states. Keep HTTP parsing, formatting and presentation in separate functions so a component never handles provider JSON directly. An illustrative state contract is:

```ts
type ForecastViewState =
  | { status: 'idle' }
  | { status: 'loading'; location: SelectedLocation }
  | { status: 'ready'; location: SelectedLocation; forecast: Forecast }
  | { status: 'error'; location: SelectedLocation; reason: 'rate_limited' | 'unavailable' };
```

## Testing Strategy

- Unit tests cover place labels, timezone-safe current and daily dates, metric formatting, nullable fields, category/day-night image mapping, malformed HTTP data and bounded error messages.
- Component tests with mocked requests cover neutral first load with zero calls, debounce/threshold, result selection, keyboard behavior, empty/error/429 states, stale search and forecast responses, explicit retry, source credit and distinct city transitions.
- Browser verification checks 360 px and desktop layouts, all ten backgrounds, focus visibility, keyboard navigation, screen-reader announcements, no horizontal overflow, and zero critical or serious axe findings. Contrast is checked against actual rendered surfaces because automated axe checks cannot fully prove photographic contrast.
- Tests never call the live provider and use fake timers rather than wall-clock sleep. `production-delivery` adds the end-to-end real-browser flow and performance gate once the local UI works.

## Boundaries

### Always

- Keep the initial screen neutral and require explicit city selection before forecast work.
- Use only the approved location and forecast HTTP contracts; format their values without changing their meaning.
- Preserve attribution, privacy, keyboard access, readable contrast and safe unavailable states.
- Keep query, coordinates and weather values out of browser logs and analytics.

### Ask first

- Change API fields, add a backend endpoint, change the seven-day horizon or select a default city.
- Add persistence, geolocation, analytics, a new provider, a state-management library or automatic retries.
- Change the three-character threshold, 300 ms debounce, day/night background rule or source-credit wording after approval.

### Never

- Treat `null` rain probability as zero; call the daily condition “predominant”; parse the local current timestamp as UTC.
- Hide text directly in imagery, rely on color alone, or silently choose a search result.
- Import `apps/api/src` at runtime, expose raw provider diagnostics, or publish images with unverified rights.

## Success Criteria

- [x] First load makes no location or forecast request and shows a useful neutral state.
- [x] A keyboard or pointer user can search, distinguish homonymous places, explicitly select one, and load its seven-day forecast.
- [x] Search, selection, loading, empty, 429, provider failure, malformed response and retry states are understandable and never show a mismatched city's data.
- [x] Current and daily metrics use the approved labels, units, local dates, distinct valid/retrieval times, null policy and “most severe” daily-condition meaning.
- [x] All ten background mappings, a neutral fallback and all source/licence credits work without compromising contrast or initial load.
- [x] The app works from 360 px through desktop with keyboard access and zero critical or serious axe violations.
- [x] Web typecheck, lint, format, tests, 80% coverage, production build, root check and boundary check pass within their active budgets.
- [x] Public deployment still waits for `production-delivery` to verify aggregate API usage, privacy, current provider licensing, image rights and performance.

## Decisions for Owner Review

1. The UI starts searching at three Unicode code points after a 300 ms debounce; the API itself still accepts two-character searches.
2. A new city selection clears the old forecast until the new response succeeds; typing alone leaves the current forecast visible.
3. The daily condition remains the “Condição mais severa”; rain chance (%) and rain volume (mm) remain distinct values in both the detailed card and compact summaries.
4. The existing WebP images may be used during local development. The owner stated on 2026-09-27 that they generated all ten in the Gemini app without uploading reference images. This records the stated origin; the public-use rights review remains part of `production-delivery`, and no ownership or licence is inferred from the files' presence in the repository.

The owner approved this spec and the resulting plan and U1–U10 tasks on 2026-09-24. The owner approved the completed local user flow at Checkpoint U-C on 2026-09-24.

The owner revised the search presentation on 2026-09-27: omit the visible "Buscar cidade" label and keep the header height stable throughout search states.
