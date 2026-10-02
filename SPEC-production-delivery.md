# Spec: Production Delivery

- **Status:** Approved for planning by owner on 2026-09-24; owner clarified use, traffic and asset origins on 2026-10-01; Cloudflare deployment amendment remains pending
- **Module id:** `production-delivery`
- **Depends on:** `location-search`, `weather-forecast`, `weather-ui`
- **Source:** `CAPABILITY-MAP.md`, `CONSTRAINTS.md`, and the four completed module specs

## Objective

Make the completed local weather flow reproducible and testable in a real browser. The original deployment target in this specification was a separately deployed static web app and single-process Node API. On 2026-10-01 the owner selected Cloudflare Free as the intended host; the Node-specific requirements below need an approved amendment before Cloudflare implementation. A public launch is a distinct decision: it requires evidence for upstream usage, current terms, privacy, image rights, performance, and deployment security. Passing local tests alone does not authorize publication.

## Planning Baseline

1. The owner confirmed on 2026-10-01 that the intended site is non-commercial. The single-process API scenario is the original planning baseline, now superseded as a deployment target by Cloudflare Free; shared controls require an approved `backend-platform` amendment.
2. The web app is built as static files and deployed separately from the API, with an explicit HTTPS API origin and a matching explicit CORS origin.
3. The owner stated that all ten WebP backgrounds were generated in the Gemini app without reference-image uploads; the five bundled night files are optimized variants of the corresponding originals under `backgrounds/`. The owner also stated that the logo was generated with AI, without identifying its tool or source assets. These statements establish reported provenance, not completed publication-rights review; see `docs/deploy/image-rights.md`.
4. Cloudflare Free is the intended host. The owner estimates about 100 users per day arriving at random times and making several consultations; this is a forecast, not a traffic ceiling or a defined peak. The production domain, enforceable provider-call budget and public release decision remain open.

The Node process, `HOST`/`PORT`/`TRUST_PROXY` and `buildApp({ fetchImpl })` requirements below record the previously approved delivery baseline. They are not an implementation recipe for Cloudflare. Task P0 in `tasks/todo.md` must replace those topology-specific requirements in an owner-approved amendment before Worker code is changed; the quality, privacy, provider-usage and publication gates continue to apply.

## Scope and Requirements

### Reproducible builds and configuration

- A clean checkout with the pinned Node/npm versions and lockfile can install dependencies and build the API and web workspaces independently. The web build must not import API runtime code, and the API build must not require web development dependencies.
- Document exact install, check, build, start, environment, health-check, and rollback commands. Include separate web and API deployment steps and a smoke test against their configured origins.
- The web build uses one explicit `VITE_API_BASE_URL` for production. Reject an empty, insecure, or mismatched production origin rather than silently relying on the development proxy. The API accepts only the deployed web origin through `CORS_ALLOWED_ORIGINS`; wildcard CORS is forbidden.
- Keep `TRUST_PROXY=false` unless the chosen topology supplies a reviewed set of trusted proxy ranges. Document how the edge restricts direct API access and absorbs abusive traffic; do not claim process-local rate limiting is DDoS protection.
- One API process is the initial deployment ceiling. Moving to multiple instances first requires a documented shared or edge enforcement design for usage and rate limits, with a corresponding `backend-platform` spec update.

### End-to-end and quality gates

- Add a small Playwright suite that runs the built web app in a browser against a real HTTP API process constructed with `buildApp({ fetchImpl })` and deterministic local provider fixtures. Neither tests nor CI call live Open-Meteo.
- Cover neutral first visit without a saved city with zero upstream calls; saved-city restoration with a fresh forecast and no geocoding call; city search and explicit selection; current conditions and all seven daily cards; no results; a failed upstream request with a visible retry path; keyboard selection; and source attribution. Assert that a new selection cannot display stale weather from the prior city.
- Keep the existing API and web unit/integration suites, 80% coverage floor in each application, architecture gate, dependency audit, and browser axe gate. The production CI pipeline runs them on a clean checkout and publishes failures clearly.
- Implement `npm run test:performance` as a repeatable mobile preview measurement of the production build. It must assert navigation LCP ≤ 2.5 s and page-lifetime CLS ≤ 0.1 under a documented device/network profile; preserve the five-minute browser-check budget. Record LCP on the neutral initial load, then keep measuring CLS through a successful forecast transition that loads the active background image. Report the profile and results, not only a pass/fail line.
- Run `gitleaks detect --redact --no-banner` in CI and before release. Findings must be redacted. No new suppression or exception may bypass `CONSTRAINTS.md`.

### Public release evidence

- Recheck the currently applicable Open-Meteo terms, pricing, attribution, and privacy information for both geocoding and forecast endpoints at release time. Record the reviewed URLs, date, chosen plan, and whether the intended site is commercial under those terms. If commercial, specify a paid endpoint and secret delivery before launch; never put a key in a Vite build or repository.
- Produce an application-wide Open-Meteo call budget that counts geocoding and forecast traffic together, including the provider's effective cost of the requested variables, cache misses, restarts, and the proposed number of API instances. Document an enforceable traffic ceiling or aggregate control with evidence it remains inside the applicable provider limits. Per-IP limits alone do not satisfy this gate.
- Publish a privacy notice that describes the user search text sent to the geocoding service, the selected coordinates/timezone sent to the forecast service including on later visits, the one selected city retained in browser-local storage until replaced or site data is cleared, the purpose of each transfer, applicable provider retention information, and the application's own log/retention behavior. Include automatic returning-visit forecast calls in the provider usage budget. Review the notice against the selected deployment and current provider documentation before launch.
- The local `weather-ui` explanation of data use is a preview of this notice. Complete the public notice with the selected host's logging and retention, the responsible party and contact route, then review it before public release. The repository link and project software licence remain unset until the owner provides them; never publish a placeholder as a real link or imply a licence applies to the project's code.
- Inventory the ten WebP files actually bundled by the web app with origin, creator, licence or written permission, required credit, and permission for the intended public use. Link each to its retained original under `backgrounds/` and document the optimization of the five night variants. Verify attribution appears where required. Unverified files cannot be included in a public build; replacing them must preserve the approved UI behavior and image-category mapping.
- Record the owner-supplied project logo's origin and permission for public use along with the image-rights evidence before release.
- Record the production hostname and edge topology, HTTPS, health-check path, CORS value, proxy-trust decision, origin access restrictions, rollback procedure, and a post-deploy smoke result. Public exposure is gated on all preceding evidence and the owner's final release approval.

## Tech Stack and Commands

Use the current npm workspaces, TypeScript, Vitest, Playwright, and Vite. Add only the tooling needed for deterministic E2E, performance measurement, secret scanning, and CI; pin dependencies in the lockfile and review the audit. The implementation plan chooses a specific CI host and measurement tool after the owner accepts the deployment assumptions.

Existing commands:

```bash
npm ci
npm run check
npm run test:coverage
npm run test:a11y
npm audit --audit-level=high
npm run build --workspace @nosso-clima/api
npm run build --workspace @nosso-clima/web
npm run start --workspace @nosso-clima/api
```

Commands this module must add and document:

```bash
npm run test:e2e
npm run test:performance
gitleaks detect --redact --no-banner
```

## Project Structure and Style

- `apps/api/` remains the API runtime and its own unit/integration tests; its provider origins and response contracts stay owned by their existing modules.
- `apps/web/` remains the static client; its components, imagery, and browser accessibility checks stay owned by `weather-ui`.
- `tests/e2e/` owns the cross-application Playwright flow and local fixture server; `tests/performance/` owns the production-build mobile measurement.
- `.github/workflows/` (if GitHub Actions is chosen) owns CI; `docs/deploy/` owns environment, provider-usage, rights, privacy, and rollback evidence.
- Keep TypeScript strict, use explicit typed configuration, validate external and environment values at runtime, and preserve the existing Biome formatting. Fail startup/build with a clear configuration error if required production values are absent; never print secrets or raw user queries.

## Testing Strategy

- E2E tests use real HTTP boundaries and a real browser while replacing only the external provider transport with deterministic fixtures. They verify outcomes visible to a user rather than repeating unit-level parser assertions.
- Production configuration tests cover accepted HTTPS web/API origins, rejected wildcard/insecure origins, CORS behavior, and any topology-specific proxy setting. A compiled API smoke test verifies `/health` and one safe invalid request without external I/O.
- The performance gate runs against built assets with a fixed mobile profile and records LCP/CLS. A failing metric remains blocking; optimization may change assets or loading behavior only within the approved `weather-ui` contract.
- CI repeats the root and workspace checks, coverage, E2E, accessibility, performance, audit, secret scan, and independent builds. Browser and security checks use the existing five-minute task-end/CI budget; local non-browser checks keep the 90-second budget.
- A deployment rehearsal verifies the documented steps and rollback using the selected host. Live-provider smoke requests, if any, are manual, bounded, and performed only after usage and privacy gates pass.

## Boundaries

### Always

- Preserve the public API contracts, UI meanings, attribution, privacy-safe logs, fixed provider origins, request bounds, and all active `CONSTRAINTS.md` floors.
- Keep E2E and performance fixtures offline and deterministic; record release evidence with dates and sources.
- Keep the API and web separately buildable and deployable.

### Require explicit owner decision before implementation or release

- Record the owner's Cloudflare Free and non-commercial choices; decide the domain, approved runtime topology and enforceable traffic ceiling before implementation or release. A future commercial change requires paid Open-Meteo plan approval.
- Change shared platform controls, provider endpoints, public contracts, CORS/proxy policy, image assets, or add external telemetry.
- Publish the site or its existing WebP assets. Release approval follows a reviewable deployment package and completed evidence gates.

### Never

- Use live Open-Meteo calls in automated tests or expose provider credentials in client assets.
- Publish images with unknown rights; claim that per-IP limits enforce an aggregate provider quota; trust arbitrary forwarding headers.
- Weaken a constraint, omit a failed check, expose raw queries/coordinates in logs, or commit secrets to make a release pass.

## Success Criteria

- [ ] Clean-install CI builds API and web independently and passes typecheck, lint, format, unit/integration tests, per-application coverage, boundaries, axe, audit, and redacted secret scan.
- [ ] `npm run test:e2e` passes the complete browser flow and failure/keyboard cases against an offline local provider fixture.
- [ ] `npm run test:performance` passes mobile navigation LCP ≤ 2.5 s and page-lifetime CLS ≤ 0.1 on a documented profile, including the forecast transition.
- [ ] Production API and web origins, CORS, HTTPS, edge access, proxy trust, health checks, and rollback are documented and rehearsed for the selected host.
- [ ] The owner has reviewed current provider terms and a defensible combined Open-Meteo usage ceiling; privacy notice and all image rights are recorded and satisfied for the intended public use.
- [ ] The owner reviews the complete release evidence before the public site is deployed.

## Open Decisions for Owner Review

1. **Resolved for the intended release:** the owner confirmed non-commercial use on 2026-10-01. Recheck the actual site's ads, sponsorship, subscriptions and current Open-Meteo terms at release; a future commercial change requires a paid-plan review.
2. **Partly resolved:** Cloudflare Free was selected and traffic is estimated at about 100 users per day at random times, with several consultations per user. The domain, peak request rate, calls per visit and enforceable aggregate ceiling remain to be specified and measured.
3. **Partly resolved:** the owner reported that all ten backgrounds were generated in Gemini without uploaded reference images and the logo was generated with AI. The logo's exact tool/source assets, file-by-file lineage, applicable generation terms and permission for the intended public use still need the `production-delivery` rights review.

The owner approved this specification for planning on 2026-09-24 and supplied the factual clarifications above on 2026-10-01. This does not approve the Cloudflare runtime amendment, the implementation plan or public deployment. The remaining decisions, evidence gates and a separate release approval still apply.
