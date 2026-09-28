# Nosso Clima web

This workspace implements the approved `weather-ui` spec. It consumes the existing API routes and starts without a network request on a first visit. After a person selects a city, the browser stores that one city locally and requests a fresh forecast for it on later visits. Clearing site data removes the saved city. Local WebP backgrounds appear only after a forecast succeeds.

From the repository root, start the API and web app in separate terminals:

```bash
npm run dev --workspace @nosso-clima/api
npm run dev --workspace @nosso-clima/web
```

Vite proxies `/api` to `http://127.0.0.1:3000`. For a build that calls a different API origin, set `VITE_API_BASE_URL` to that origin before building. Production origin and CORS decisions belong to `production-delivery`.

Run the local checks with `npm run check --workspace @nosso-clima/web`, `npm run test:coverage --workspace @nosso-clima/web`, and `npm run check:boundaries`. The browser accessibility gate requires Playwright's Chromium (`npx playwright install chromium` on a fresh machine), then `npm run test:a11y`.

The ten bundled background files are approved for local development. Their publication rights and provider licensing must be verified by `production-delivery` before a public release.

The footer contains a local explanation of data use, project information, and the distinct data and icon licences. The repository URL is intentionally unset in `src/components/site-information.tsx` until the owner provides a public address; the site shows non-clickable text meanwhile. The project code has no licence selected. This local explanation does not replace the release-time privacy notice, which needs the selected host's logging/retention and a public contact route.

The owner-supplied brand variants live in the repository's `logo/` directory. The dark-header vector wordmark is copied into `src/assets/brand/`; the supplied favicon and touch/home-screen icons are copied into `public/`. The page loads only the header wordmark and browser-selected icons.
