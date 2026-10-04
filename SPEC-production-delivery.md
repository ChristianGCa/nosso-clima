# Spec: Production Delivery — single Worker amendment P0

- **Status:** P0 proposal blocked by the owner's 2026-10-03 requirement that Open-Meteo never receive a visitor IP; no approval of this amended spec or public deployment
- **Module id:** `production-delivery`
- **Depends on:** `backend-platform`, `location-search`, `weather-forecast`, `weather-ui`
- **Previous pre-P0 draft:** [archived for history](docs/history/production-delivery-pre-p0-2026-10-03.md)

## Objective and decisions

Deliver the completed weather flow as **one Cloudflare Worker** serving Vite's built static assets and a Fetch-native same-origin API. The Worker name should contain `nosso-clima`, yielding a free `<worker>.<account-subdomain>.workers.dev` URL subject to availability. The owner will not buy a custom domain. The site has no ads, sponsorship, subscriptions or other monetization, confirmed on 2026-10-03. About 100 daily visitors making several consultations is a planning estimate, not a capacity ceiling. Public publication remains a separate owner decision after all evidence gates pass.

The proposed topology eliminates the separate Pages/API deployment, production CORS and `VITE_API_BASE_URL`. It also removes the Node/Fastify production app after a tested cutover. The owned public route contracts remain in the location and forecast specs; shared controls remain in `SPEC-backend-platform.md`. This spec owns delivery, browser gates, privacy/rights evidence, CI and rollback. The old Node-specific requirements are superseded, not kept as a second deployment path.

**Blocking change to this draft:** the owner requires zero visitor-IP transfer to Open-Meteo. Cloudflare's [Worker subrequest header behavior](https://developers.cloudflare.com/fundamentals/reference/http-headers/) means this single-Worker proposal cannot yet guarantee that requirement. Do not approve or implement it as written. Redesign P0 around a verified no-forwarding path; treat the text below as a candidate's acceptance checklist, not an authorized deployment plan.

## P1 feasibility before production implementation

- Pin Wrangler, workerd and the Workers Vitest pool for an **isolated spike**. Measure representative health, geocoding and forecast CPU with fixture responses locally and in private staging, including D1, cold paths and failures; each invocation must fit the Free 10 ms CPU limit with margin. Record bundle size, memory behavior and subrequests.
- Prove the Worker rate-limit bindings implement an acceptable 60/30/15 abuse brake, including malformed paths and preflights. Confirm `CF-Connecting-IP` is edge-provided on the chosen route and that no alternate path accepts a spoofed copy. Measure the HMAC derivation of a pseudonymous binding key, secret rotation and failure closed; never pass the raw IP as the binding key. Bindings return success/failure only, so the proposed API omits unverifiable `Retry-After` and `x-ratelimit-*` values. Record how this affects the UI and any existing tests.
- Demonstrate one atomic D1 reservation for combined geocoding/forecast weighted credits, concurrent misses, three windows, rollover and failure closed. Measure queries and rows read/written per scenario against 50 queries/invocation, 5 million reads/day and 100,000 writes/day.
- Confirm forecast's effective weight for its 5 current plus 8 daily variables and seven days using the [official Open-Meteo calculator](https://open-meteo.com/en/pricing/). The provisional 1.3 estimate is **unverified**. Then make at most one manual geocoding and one manual forecast request from a private Worker to observe status/429 behavior of Cloudflare egress. Recheck current terms first, log no raw query/IP/coordinates and record count, date and result. Automated tests never contact Open-Meteo.
- Check whether the Worker-to-provider subrequest can carry the visitor's IP in `CF-Connecting-IP` even when application code does not forward it. Use [Cloudflare's header rules](https://developers.cloudflare.com/fundamentals/reference/http-headers/) and a controlled staging echo test; record only whether visitor IP was forwarded, never its value. Classify the actual Open-Meteo route as far as evidence permits. Unless absence is proven, treat the visitor IP as possibly transferred to Open-Meteo in the privacy notice and LGPD assessment. If zero such transfer is a requirement and cannot be enforced, return to P0 for another topology.
- Establish Workers-pool coverage with a supported provider such as Istanbul, retaining **80% lines, branches, functions and statements per application**. Native V8 coverage is [not supported by that pool](https://developers.cloudflare.com/workers/testing/vitest-integration/known-issues/). A failed feasibility item returns to P0 review before production route code.

## Build, security and browser behavior

- A clean checkout with pinned Node 24/npm 12 and lockfile runs `npm ci`, root `npm run check`, `npm run test:coverage`, `npm run test:a11y` and `npm audit --audit-level=high`. Build the Worker and web source independently for quality checks, then package **one** deployable Worker plus Vite assets. No web-to-API runtime import or reverse import is allowed.
- Production browser requests use relative `/api/v1/*`. The production build rejects a supplied `VITE_API_BASE_URL`, whether HTTP, HTTPS, loopback or divergent, instead of silently changing origin; local fixture configuration must be explicit and test-scoped. API responses emit no wildcard CORS. Test HTTPS, same-origin requests and rejection of a mismatched `Origin`.
- Configure assets so matching static files bypass Worker code and `/api/*` plus `/health` run it first. Unknown API paths return JSON errors. Test unknown non-API paths and minimize script invocations by static requests where the platform permits; document any residual amplification path. Verify hashed Vite `/assets/*` files get long-lived `immutable` cache headers while HTML and unversioned files revalidate. Inspect the published artifact and preview response headers.
- Serve a restrictive CSP with `connect-src 'self'`, a referrer policy and HTTPS HSTS. The CSP must permit the app's necessary assets and safe external **navigation** links while preventing browser fetches to Open-Meteo. Browser E2E inspects every request and fails on a fetch to another host. Do not put provider keys or secrets in client assets.
- On `workers.dev` without an owned zone, custom zone WAF rules should not be assumed available. Cloudflare Free permits 100,000 Worker script requests/day; an abusive API flood can exhaust that allowance even with per-visitor limits. Static assets can remain accessible if routed without script execution. Record the residual availability risk, measured protections and Cloudflare's available DDoS behavior; never call a binding or process-local limiter complete DDoS protection.

## E2E, performance and CI gates

- Add Playwright E2E against the **same compiled Worker and static artifact intended for publication**, under local workerd with deterministic outbound fixtures. Test neutral first visit with no provider work; restored city without geocoding; search/select; conditions and all seven cards; no results; upstream failure and retry; keyboard selection; attribution; stale-city prevention; rate/quota denial; and no third-party browser fetch. Do not use `buildApp({ fetchImpl })` or a separate Node HTTP process.
- Add `npm run test:performance` against the packaged artifact with a documented mobile device/network profile. Enforce navigation LCP ≤ 2.5 s and page-lifetime CLS ≤ 0.1. Measure both neutral first visit and a returning visit whose forecast loads the active background; continue CLS through that transition. Record profile and values, not only pass/fail, within the existing five-minute browser budget.
- Keep `CONSTRAINTS.md` floors intact: types, lint, format, all relevant tests, per-app coverage, architecture, axe, performance, audit and redacted `gitleaks detect --redact --no-banner`. Add local commands and hosted CI configuration once a host is chosen. The owner has no remote yet; hosted CI and repository URL are **blocking pending evidence**, not optional checks. Record a failing gate without deleting tests or reducing thresholds.

## Release evidence and privacy

- Revalidate [Open-Meteo terms](https://open-meteo.com/en/terms/) and [pricing](https://open-meteo.com/en/pricing/) at release with URL/date and actual no-monetization confirmation. The Free limits are below 600 weighted calls/minute, 5,000/hour and 10,000/day as reviewed on 2026-10-03. Attribution and modification notices remain visible. A commercial change requires paid-plan review and secret handling before launch.
- Produce an enforceable **aggregate** forecast-plus-geocoding budget: effective weight × cache misses, including searches, selections, returning visits, cold isolates/restarts and an adversarial peak. Show separate minute/hour/day ceilings with margin below provider limits and D1 Free capacity. Per-IP limits, estimated 100 daily visitors and cache hits alone cannot satisfy this gate.
- Treat LGPD as applicable for release planning. The public notice identifies responsible party `ChristianGCa` and `christiangca.dev@gmail.com`, Cloudflare's receipt of every visitor IP, possible forwarding of that IP on Worker subrequests to Open-Meteo unless disproven, actual Worker/asset logging and retention, transfers to Cloudflare and Open-Meteo, search text sent for geocoding, selected coordinates/timezone sent for forecast including on return, one city saved in browser storage until replacement or clearing, purpose and user contact route. Confirm the selected Cloudflare configuration and provider retention before publication; the current Open-Meteo terms say free-service logs with coordinates are deleted after 90 days.
- The code licence is MIT and must be served in the site; it does not apply to the backgrounds, logo, third-party icons or data. Do not display a repository URL until a remote exists. Review the ten **bundled** WebP variants and logo file by file for origin, public-use permission, required credit, visible marks/people/text and active/external SVG content. The owner declared Gemini backgrounds without uploaded references and instructed publication; the logo was generated in Claude personal Free from text only. Keep the originals and optimization chain recorded in `docs/deploy/image-rights.md`.
- Record exact hostname, HTTPS, asset/API routes, bindings, limits, header observations, provider budget, privacy notice, rights, log settings, monitoring, smoke and rollback in a dated release review. A public launch requires the owner's separate final approval.

## Staging and rollback

- Rehearse private staging deployment and rollback of the **single Worker artifact**, including static files, API, rate bindings and D1. Apply D1 migrations by expand/contract so the prior deployed Worker version remains compatible until rollback is no longer needed. Exercise health, validation, provider fixture paths and one bounded live-provider smoke only after its terms/privacy/usage gates pass.
- Verify staging CPU, D1 rows/queries, static cache/security headers, logs without personal data, browser E2E, LCP/CLS and return to the previous Worker version. Record version IDs, commands, dates and outcome; never call an untested rollback ready.

## Commands to add

```bash
npm run test:e2e
npm run test:performance
gitleaks detect --redact --no-banner
```

The production build/deploy commands must be pinned and documented after P1 chooses the Worker toolchain. No deployment command runs automatically in CI before final release approval.

## Approval boundary

This text is a **draft P0 replacement** for owner review. Approval authorizes the isolated P1 spike; production implementation follows only if P1 passes or a revised design is approved. It does not approve public deployment. All active `CONSTRAINTS.md` checks remain binding.

## Official Cloudflare sources checked 2026-10-03

- [Workers URL naming](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Static assets](https://developers.cloudflare.com/workers/static-assets/) and [billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)
- [Static asset headers](https://developers.cloudflare.com/workers/static-assets/headers/)
- [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) and [pricing](https://developers.cloudflare.com/d1/platform/pricing/)
