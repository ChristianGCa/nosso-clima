# NossoClima web

This workspace implements the approved `weather-ui` spec. It consumes the existing API routes and starts without a network request on a first visit. After a person selects a city, the browser stores that one city locally and requests a fresh forecast for it on later visits. Clearing site data removes the saved city. Local WebP backgrounds appear only after a forecast succeeds.

From the repository root, start the API and web app in separate terminals:

```bash
npm run dev --workspace @nosso-clima/api
npm run dev --workspace @nosso-clima/web
```

Vite proxies `/api` to `http://127.0.0.1:3000`. The local client also accepts `VITE_API_BASE_URL` for a separate development API origin. Production uses relative `/api/v1/*` paths with a web-to-API rewrite; leave the variable **unset**, including when copying `.env.example` into `.env`. An empty value is rejected by the production build. P7 build validation is implemented and tested; hosted routing still needs the P1 evidence in the [active plan](../../tasks/vercel-plan.md).

Run the local checks with `npm run check --workspace @nosso-clima/web`, `npm run test:coverage --workspace @nosso-clima/web`, and `npm run check:boundaries`. The browser accessibility gate requires Playwright's Chromium (`npx playwright install chromium` on a fresh machine), then `npm run test:a11y`.

The ten bundled background files are approved for local development. The ten originals remain in the repository's `backgrounds/` directory; all bundled files are optimized variants. `production-delivery` must trace the bundled files to their sources and verify publication rights and provider licensing before a public release.

The browser accessibility command checks all ten backgrounds at mobile and desktop sizes and records conservative text/control contrast ratios. The [2026-10-04 report](../../docs/quality/contrast-2026-10-04.md) is the latest measurement after the card changes; the [2026-10-01 report](../../docs/quality/contrast-2026-10-01.md) explains the method and preserves the previous matrix.

The footer explains browser storage, Vercel's receipt of the connection IP, temporary visitor counters, and Upstash search/forecast cache TTLs. It includes the project contact, the GitHub repository and separate code, data and icon licences. The release review must still confirm the selected hosting regions and hosting log retention.

The owner-supplied brand variants live in the repository's `logo/` directory. The dark-header vector wordmark is copied into `src/assets/brand/`; the supplied favicon and touch/home-screen icons are copied into `public/`. The page loads only the header wordmark and browser-selected icons.

## Hosted Preview status (2026-10-08)

The changes are consolidated in `main`; `chore/vercel-p1` is the active validation branch. The owner confirmed the web flow and improved operation after increasing the test quota. Both projects have All Deployments protection. The [current record](../../docs/deploy/preview-progress-2026-10-08.md) explains branch URL pairing, local `API_ORIGIN` for CLI config compilation, skipped unchanged builds and the distinction between request rate limits and weighted provider credits. A 503 with `quota_denied` blocks a cache miss before the provider fetch; valid cache hits remain available. CSP messages for the Vercel Toolbar/SSO manifest are separate. P1 and public-release gates remain open; the owner performs the dashboard changes.
