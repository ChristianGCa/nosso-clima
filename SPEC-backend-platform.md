# Spec: Backend Platform — Cloudflare Worker amendment P0

- **Status:** P0 proposal blocked by owner requirement on 2026-10-03 that Open-Meteo never receive a visitor IP; the single-Worker outbound path has no verified guarantee of this
- **Module id:** `backend-platform`
- **Consumers:** `location-search`, `weather-forecast`, `production-delivery`
- **Previous approved Node baseline:** [archived for history](docs/history/backend-platform-node-baseline-2026-09-23.md)

## Objective and boundary

Provide shared HTTP, configuration, rate limiting, provider quota, cache, concurrency, logging and health controls for the existing geocoding and forecast contracts. The proposed production runtime is **one Cloudflare Worker with a Fetch handler and static assets**. The current Node/Fastify implementation is legacy until Worker gates pass. `production-delivery` owns hosting, static security headers, E2E, CI, privacy notice and rollback. Provider URLs, response parsing and domain normalization stay with their source modules.

The owner approved drafting this topology because the free URL only needs to contain `nosso-clima`; the target is `nosso-clima.<account-subdomain>.workers.dev` if available. The owner conditionally accepts changed limit headers and use of Cloudflare's client-IP header if the security and privacy checks below pass. No Worker production code begins before approval of this spec and P1 feasibility evidence.

The owner's later requirement is absolute: Open-Meteo must never receive the visitor IP. Cloudflare documents possible forwarding of the visitor IP in `CF-Connecting-IP` on Worker subrequests. Thus this topology is **not approved** and must not advance to P1 under this draft. A replacement P0 must use a verified path that removes this disclosure, or select a separate server-side API runtime whose outbound requests are constructed without visitor forwarding headers.

## Worker lifecycle and configuration

- Export a Fetch handler receiving `Request`, typed bindings and execution context. Do not call `listen`, attach signal handlers, depend on `process.env` or carry correctness-critical state across invocations. Node 24/npm 12 remain the local build/test toolchain, not the deployed runtime.
- Route `/api/v1/locations`, `/api/v1/forecast` and `/health` through one HTTP adapter. Matching static assets bypass the script; API and health paths run the script first. Unknown API paths return the public 404 envelope, never the SPA HTML fallback. P1/P7 must verify whether unknown non-API paths invoke the script, since random paths could otherwise exhaust the Free quota.
- Require one D1 binding for aggregate provider credits, three Worker rate-limit bindings for global/location/forecast limits, a secret binding for HMAC pseudonymization of the visitor key, and an assets binding. Reject missing or malformed bindings before provider work with a safe `503`; never print binding values. D1, HMAC or limiter failure fails closed for provider calls.
- Inject clock, provider transport and bindings in tests. Production and E2E execute the same compiled Worker entry point; fixtures replace only outbound Open-Meteo transport.
- P1 must measure CPU, memory, subrequests and assets within Free limits. An over-budget path blocks implementation or requires a reviewed redesign; no quality or security limit is lowered to pass.

## Public HTTP contract

- Keep existing paths, methods, query bounds, response shapes, provider credits and seven-day semantics from `SPEC-location-search.md` and `SPEC-weather-forecast.md`. Preserve `GET /health` as `200` JSON `{ "status": "ok" }` with no external I/O or dependency details.
- Every response has a server-generated random UUID `x-request-id`. Every public error uses the same ID in `{ "error": { "code", "message", "requestId", "details?" } }`, with existing codes `VALIDATION_ERROR`, `NOT_FOUND`, `RATE_LIMITED`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`. Preserve the documented `400`, `404`, `413`, `415`, `429`, `500` and `503` meanings. Never expose arbitrary input, upstream bodies, stacks, paths or configuration.
- Cap body input at 16 KiB. Reject unsupported media and malformed URL/query input before outbound work. Provider integrations retain fixed origins, finite timeouts and bounded decoded responses from their own specs. Do not deliberately copy visitor IP or inbound forwarding headers into outbound requests. Cloudflare may nevertheless add `CF-Connecting-IP` to Worker subrequests; see the release privacy gate.
- The browser calls relative same-origin `/api/v1/*` URLs. Production has no `VITE_API_BASE_URL`, `CORS_ALLOWED_ORIGINS` or `TRUST_PROXY`. Emit no permissive CORS headers. Reject a nonmatching `Origin` when present; a missing `Origin` grants no trust to forwarding headers. Local fixture URLs are limited to test/development.

## Visitor rate limiting

- Apply Worker rate-limit bindings before validation and provider work. Keep independent 60 requests/minute across API and `/health`, 30/minute for locations and 15/minute for forecast. Each business request passes both global and group buckets. Malformed/unknown API paths and preflights count globally; static assets served without the script do not.
- Bindings enforce limits per Cloudflare location with eventual consistency. They are an abuse brake, **not an exact global per-IP guarantee**. D1 separately controls aggregate provider spend. P1 must verify binding availability, cost and behavior for malformed paths and preflights, and burst behavior at the boundary. Unacceptable behavior requires a new owner-reviewed design.
- Read the client IP from `CF-Connecting-IP` only on Cloudflare's direct `workers.dev` route after confirming there is no alternative origin accepting user-supplied copies. Ignore `X-Forwarded-For`, `Forwarded` and similar headers. Validate the IP, compute a keyed HMAC with a secret binding and pass only the fixed-length pseudonymous digest to the rate-limit bindings; the raw IP exists only transiently during the request. A missing/malformed header or unavailable HMAC secret denies provider work. Do not persist raw IP in D1, application logs, rate-limit keys or caches. P1 must measure HMAC CPU and prove spoofed forwarded headers do not change the derived key.
- A binding denial returns `429`, `RATE_LIMITED` and the request ID. Omit `Retry-After` and `x-ratelimit-*` unless an exact verified source exists; the prior Node header contract is superseded by this proposal. The UI handles `429` by code/status without those headers.

## Aggregate provider quota

- Before **every real** geocoding or forecast fetch, atomically reserve the confirmed effective weight in D1 against shared minute, hour and day windows, with margin below the Open-Meteo Free limits. Both integrations share counters. Cache hits, invalid requests and denials make zero provider calls and consume no new credits. Retain a reservation when outbound work times out or fails because the provider may have received it.
- Store only aggregate window IDs and numeric counters in D1, never IP, search text, coordinates, timezone or provider payload. Reservations must be safe under concurrent isolates, cold starts and multiple locations. A failed/unavailable reservation makes zero provider calls and returns `503` with `SERVICE_UNAVAILABLE`.
- P1 demonstrates real conditional SQL, row reads/writes, rollover, concurrent misses and D1 failure behavior in workerd and staging, within 50 queries per invocation and Free daily row limits. P10 fixes the budget from the provider calculator, observed cache misses, return visits and peak requests. No public provider call is allowed before an enforceable ceiling is evidenced.

## Isolate-local resilience and safe logs

- Bounded TTL/LRU caches, single-flight and a bounded outbound executor may be reused as isolate-local optimizations. Expiry at `age >= ttlMs`, failed-work eviction, finite queue waits and outbound timeouts remain required. Isolate state can disappear or multiply; quota correctness depends on D1. Do not persist queries or forecasts to platform storage.
- Structured application logs contain only request ID, method, route template, status, duration and bounded operational categories. Do not log raw IP, full URL/query, search text, coordinates, bodies, cache keys, arbitrary exception messages, secrets or provider payloads. Hosting retention and transfer are release evidence owned by `production-delivery`.
- Rate rejection, cache hit/miss, quota denial, upstream failure and saturation must be diagnosable without personal data. External telemetry requires an approved spec change.

## Tests and acceptance

- Workerd HTTP tests cover health, errors/status, request ID, body/media bounds, same-origin policy, unknown/malformed routes, spoofed headers, binding failure, layered 60/30/15 limits, cold isolates, cache/queue behavior, D1 atomicity and safe logs. Automated provider traffic is fixture-only and tests use fake time.
- P1 must examine [Cloudflare's documented Worker subrequest headers](https://developers.cloudflare.com/fundamentals/reference/http-headers/) for the Open-Meteo destination class and measure what a controlled external endpoint receives from the actual staging route without recording a real visitor IP. Until absence of the visitor IP is demonstrated, treat Open-Meteo as a possible recipient of it and reflect this in the privacy notice and transfer review. If the owner requires zero visitor-IP disclosure to Open-Meteo and the platform cannot ensure it, stop the Worker design for review.
- `npm run check`, per-app `npm run test:coverage` at **at least 80% in lines, branches, functions and statements**, boundaries, audit and browser gates in `CONSTRAINTS.md` stay blocking. If the Workers Vitest pool cannot use V8 coverage, use supported instrumentation such as Istanbul while retaining every threshold. No test is skipped or removed for migration.
- Compare observable provider-route responses with the old Node baseline during migration, then remove the Node app, Fastify runtime dependencies and stale lifecycle tests in the same reviewed cutover. Retain source-module contract tests and replace Node-only checks with Worker equivalents; do not maintain two production implementations indefinitely.
- P1 measures representative geocoding and forecast CPU below 10 ms with margin locally and in private staging. Full Worker build, tests, D1 metrics and release evidence pass before marking this module complete. All new criteria remain unchecked until measured.

## Approval boundary

Owner approval of this P0 text authorizes an isolated P1 spike and, only after P1 acceptance, Worker implementation. It does not authorize public deployment. If P1 disproves rate, quota, privacy or Free-capacity assumptions, revise this spec and obtain approval before production code.

## Official sources checked 2026-10-03

- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Static assets](https://developers.cloudflare.com/workers/static-assets/) and [billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)
- [Worker rate-limit binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) and [pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [Workers Vitest limitations](https://developers.cloudflare.com/workers/testing/vitest-integration/known-issues/)
