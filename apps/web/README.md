# Nosso Clima web

This workspace implements the approved `weather-ui` spec. It consumes the existing API routes, starts without a selected city or network request, and uses local WebP backgrounds only after a forecast succeeds.

From the repository root, start the API and web app in separate terminals:

```bash
npm run dev --workspace @nosso-clima/api
npm run dev --workspace @nosso-clima/web
```

Vite proxies `/api` to `http://127.0.0.1:3000`. For a build that calls a different API origin, set `VITE_API_BASE_URL` to that origin before building. Production origin and CORS decisions belong to `production-delivery`.

Run the local checks with `npm run check --workspace @nosso-clima/web`, `npm run test:coverage --workspace @nosso-clima/web`, and `npm run check:boundaries`. The browser accessibility gate requires Playwright's Chromium (`npx playwright install chromium` on a fresh machine), then `npm run test:a11y`.

The ten bundled background files are approved for local development. Their publication rights and provider licensing must be verified by `production-delivery` before a public release.
