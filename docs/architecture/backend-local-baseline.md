# Backend Platform — baseline local aprovado

Este documento preserva o baseline aprovado em 2026-09-23. Os contratos locais continuam vinculantes nos pontos referenciados pela [spec vigente](../../SPEC-backend-platform.md); a entrada Vercel e as alterações posteriores são definidas nessa spec. Estrutura de arquivos, versões e comandos abaixo registram o baseline original; para executar o checkout atual, use o [README](../../README.md).

Status: Complete; corrective implementation reviewed and approved by owner on 2026-09-23
Module id: `backend-platform`
Depends on: —
Consumers: `location-search`, `weather-forecast`, `production-delivery`

## Objective

Create the small, secure and testable Fastify foundation on which the weather capabilities will run. The module owns process startup, validated configuration, HTTP-wide behavior, cache primitives, inbound rate limiting, shared outbound protection, structured logging, health reporting and graceful shutdown.

The platform must let downstream modules focus on geocoding and weather behavior without reimplementing infrastructure concerns. It must run as one persistent Node.js process for the MVP and remain explicit about the limitations of in-memory state.

### Users and success

- End users receive predictable, safe HTTP behavior even when they submit invalid input or the service is under moderate abuse.
- The frontend can depend on a stable error envelope and request identifier.
- The developer can diagnose requests, cache behavior, throttling and external-call failures without logging raw IP addresses, queries or coordinates.
- A deployment platform can determine whether the process is healthy and stop it gracefully.

### Non-goals

- City-search endpoints or Open-Meteo geocoding logic.
- Weather endpoints, WMO mapping or forecast transformation.
- Frontend code or visual assets.
- Authentication, sessions, accounts or a database.
- Redis, distributed rate limiting or multi-instance consistency.
- Claiming application-level rate limiting as complete DDoS protection.
- Choosing a hosting provider, CDN or WAF; those belong to `production-delivery`.

## Functional Requirements

### Application lifecycle

- `buildApp(options)` creates and configures a Fastify instance without opening a network port.
- `server.ts` is the only production entry point that reads process configuration, calls `listen` and handles `SIGINT` and `SIGTERM`.
- Startup fails before listening when environment validation or plugin registration fails.
- Shutdown stops accepting requests, waits for Fastify to close and exits non-zero if graceful shutdown fails.
- Versioned business routes will use `/api/v1`; operational health remains unversioned at `/health`.

### Configuration

Environment configuration is parsed once at startup and exposed as an immutable typed object. Unknown application variables are ignored, while every consumed variable is validated.

| Variable | Development default | Production rule |
|---|---:|---|
| `NODE_ENV` | `development` for the in-process configuration parser | The production entry point requires an explicit value from `development`, `test`, `production`; it never implicitly loads a development-only pretty logger |
| `HOST` | `127.0.0.1` | Explicitly set by the deployment environment; commonly `0.0.0.0` in a container |
| `PORT` | `3000` | Integer from 1 through 65535 |
| `LOG_LEVEL` | `info` | One of the supported Pino levels |
| `CORS_ALLOWED_ORIGINS` | Local web origin | Required and non-wildcard in production |
| `TRUST_PROXY` | `false` | Remains false until `production-delivery` supplies explicit trusted proxy CIDRs; blanket `true` is forbidden |
| `API_RATE_LIMIT_MAX` | `60` | Positive integer |
| `API_RATE_LIMIT_WINDOW_MS` | `60000` | Positive integer |
| `CACHE_MAX_ENTRIES` | `1000` | Positive integer with a documented memory review before increasing |
| `UPSTREAM_MAX_CONCURRENCY` | `10` | Positive integer |

Secrets are not needed for the free Open-Meteo API. `.env` is local-only; `.env.example` contains names and safe placeholders, never real values.

### Health contract

`GET /health` checks only this process. It must not call Open-Meteo or another network service.

Successful response:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "status": "ok"
}
```

The endpoint does not expose dependency versions, environment variables, memory details or uptime. In local development it receives the normal global limiter. A production edge may use a separate rule or private health path, but the public origin must not leave it unlimited.

### Error contract

Every public error uses one envelope:

```ts
type ApiErrorResponse = {
  error: {
    code:
      | 'VALIDATION_ERROR'
      | 'NOT_FOUND'
      | 'RATE_LIMITED'
      | 'SERVICE_UNAVAILABLE'
      | 'INTERNAL_ERROR';
    message: string;
    requestId: string;
    details?: ReadonlyArray<{
      field: string;
      reason: string;
    }>;
  };
};
```

Rules:

- Error codes and object shape are stable API behavior; message text is informational and must not be used for frontend branching.
- Validation details include only allowlisted field names and generic reasons.
- Unknown routes return `404` with `NOT_FOUND`.
- Invalid request parameters return `400` with `VALIDATION_ERROR`.
- Unsupported request media types return `415` with `VALIDATION_ERROR`; bodies over 16 KiB return `413` with `VALIDATION_ERROR`. The HTTP status remains authoritative while the public code groups client input failures.
- A local rate-limit rejection returns `429` with `RATE_LIMITED` and `Retry-After`.
- Temporary saturation or an unavailable required dependency returns `503` with `SERVICE_UNAVAILABLE`.
- Unexpected failures return `500` with `INTERNAL_ERROR`.
- Stack traces, dependency response bodies, filesystem paths and configuration values never appear in the public response.

### Request identity and logging

- Fastify generates the request ID. Client-provided forwarded headers are not trusted while `TRUST_PROXY=false`.
- Request IDs are random UUIDs generated by the server and remain unique across process restarts. Each structured request log contains the ID once.
- Every response includes `x-request-id` so a user-visible failure can be correlated with logs.
- Production logs are newline-delimited JSON. Pretty printing is development-only.
- Request completion logs contain request ID, method, route template, status code and duration, including when malformed URL paths bypass Fastify's normal response hook.
- Security and infrastructure events include rate-limit rejection, cache hit/miss, upstream saturation and graceful-shutdown outcome.
- Expected operational failures have safe, bounded diagnostic classifications; public responses and logs do not expose raw input or arbitrary exception messages. Cache events at the default info level are correlated with their request.
- Logs must not persist raw IP addresses, complete URLs with query strings, search text, coordinates, response bodies or environment values.
- Cache keys are not logged because they may contain location data.

### CORS and HTTP hardening

- CORS accepts only origins in `CORS_ALLOWED_ORIGINS`; wildcard origins are forbidden in production.
- Only the methods and headers required by implemented routes are allowed.
- Security headers are installed through the official Fastify helmet plugin.
- The request body limit is 16 KiB. Current public routes are `GET`, but the limit protects future additions.
- Direct trust of `X-Forwarded-For` or similar headers is forbidden. Proxy trust can be enabled only for an allowlisted deployment topology specified by `production-delivery`.

### Inbound rate limiting

- `@fastify/rate-limit` runs at `onRequest`, before route work and external calls.
- One global counter limits all API and health traffic to 60 requests per 60 seconds per normalized client IP.
- Invalid and unknown-route requests, including CORS preflights and malformed URL paths, count toward the same global limit before CORS can answer.
- A second, independent counter limits the `location-search` route group to 30 requests per minute per IP.
- A second, independent counter limits the `weather-forecast` route group to 15 requests per minute per IP.
- A request to either business route must pass both its route-group counter and the global counter. Alternating endpoints must never bypass the 60-request aggregate ceiling.
- Exceeded limits return `429`, the stable error envelope, `Retry-After` and standard rate-limit headers.
- Repeated excess remains `429`; the application does not expose a permanent IP-ban mechanism.
- The store is in memory and therefore valid only for the approved single-process MVP. Multiple instances require a shared store or enforcement at the edge before scaling.
- Version 11.2.0 or newer within major 11 is mandatory because earlier versions have a published IPv6 rate-limit bypass.

### Cache and duplicate-work control

The module exposes infrastructure primitives, not weather-specific policies:

```ts
type CacheSetOptions = Readonly<{ ttlMs: number }>;

interface Cache<Key, Value> {
  get(key: Key, logger?: CacheLogger): Value | undefined;
  set(key: Key, value: Value, options: CacheSetOptions): void;
  delete(key: Key): boolean;
  clear(): void;
  readonly size: number;
}

// Provider routes pass request.log to emit correlated hit/miss events at info level.
interface CacheLogger {
  info(bindings: { event: 'cache_hit' | 'cache_miss' }, message: string): void;
}

interface SingleFlight {
  run<Value>(key: string, operation: () => Promise<Value>): Promise<Value>;
}
```

- The cache uses LRU eviction and per-entry TTL.
- An entry expires when its age reaches the configured TTL (`age >= ttlMs`), including the exact boundary; a read at that instant returns `undefined` and removes it.
- A missing key and an expired key both return `undefined`; an expired entry is removed.
- The maximum number of entries is configured and cannot grow without a bound.
- Cache values are process-local and disposable; correctness must not depend on their survival.
- `buildApp` offers one bounded cache per provider namespace and creates one process-wide `SingleFlight` and outbound executor. Provider registration receives `config`, `createCache(namespace)`, `singleFlight` and `executor` through a typed context; provider modules do not create their own concurrency ceiling.
- `SingleFlight` makes concurrent operations with the same key share one promise.
- Failed operations are never cached and are removed from `SingleFlight` after settlement.
- Location and weather TTL values belong to their provider module specs.

### Outbound concurrency protection

The platform exposes a bounded executor for downstream Open-Meteo adapters:

- No more than `UPSTREAM_MAX_CONCURRENCY` external operations execute concurrently in one process.
- The waiting queue is bounded to the same size as the concurrency limit; excess work fails fast as `SERVICE_UNAVAILABLE` instead of growing memory without limit.
- Downstream adapters remain responsible for request timeout, status handling and response validation.
- Every queued operation has a 5-second maximum wait and then fails as `SERVICE_UNAVAILABLE`. Downstream adapters must use a finite abort signal for the entire outbound operation, including body reading, so running work eventually releases capacity; queue waiting does not weaken that deadline.
- Retries are opt-in and must never retry `429` blindly.
- This control protects process resources and external quota; it is not a replacement for edge DDoS protection.

## Tech Stack

Versions were checked on 2026-09-21. The lockfile is authoritative after installation.

| Concern | Choice |
|---|---|
| Runtime | Node.js `24.21.x` LTS |
| Package manager | npm `12.0.x` with workspaces |
| Language | TypeScript `7.0.2`, ESM, strict mode |
| HTTP server | Fastify `5.12.5` |
| Runtime schemas | TypeBox `1.3.34` with `@fastify/type-provider-typebox` `6.1.0` |
| Environment validation | `env-schema` `8.0.0` |
| CORS | `@fastify/cors` `11.3.0` |
| Security headers | `@fastify/helmet` `13.1.1` |
| Rate limiting | `@fastify/rate-limit` `11.2.0` |
| LRU cache | `lru-cache` `11.5.3` |
| Development runner | `tsx` `4.23.15` |
| Tests | Vitest `5.0.1` and `@vitest/coverage-v8` `5.0.1` |
| Formatting and lint | Biome `2.5.14` |
| Node types | `@types/node` `24.13.6` |

Dependency ranges may accept compatible patches, but `package-lock.json` must be committed and CI must use `npm ci`. Major upgrades require a spec update and review.

## Commands

These root commands must exist after the module is implemented:

```bash
# Install exactly from the committed lockfile
npm ci

# Run the API with reload in development
npm run dev --workspace @nosso-clima/api

# Type-check without emitting
npm run typecheck --workspace @nosso-clima/api

# Lint and check formatting
npm run lint --workspace @nosso-clima/api
npm run format:check --workspace @nosso-clima/api

# Run tests once and with coverage
npm test --workspace @nosso-clima/api
npm run test:coverage --workspace @nosso-clima/api

# Build and run production output
npm run build --workspace @nosso-clima/api
npm run start --workspace @nosso-clima/api

# Run the module handoff gate
npm run check --workspace @nosso-clima/api

# Audit production and development dependencies
npm audit --audit-level=high
```

The root workspace also exposes `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run test:coverage` and `npm run check` to run the corresponding scripts across implemented applications.

## Project Structure

```text
package.json                         npm workspace and root quality commands
package-lock.json                    single authoritative dependency lockfile
biome.json                           shared formatting and lint rules
tsconfig.base.json                   shared strict TypeScript options
apps/
└── api/
    ├── package.json                 @nosso-clima/api scripts and dependencies
    ├── tsconfig.json                API build configuration
    ├── vitest.config.ts             tests and 80% coverage thresholds
    ├── src/
    │   ├── app.ts                   side-effect-free Fastify construction
    │   ├── server.ts                process startup and shutdown
    │   ├── config/
    │   │   └── env.ts               validated immutable configuration
    │   ├── errors/
    │   │   ├── api-error.ts         internal typed error
    │   │   └── error-handler.ts      public error mapping
    │   ├── infrastructure/
    │   │   ├── cache.ts             bounded TTL/LRU adapter
    │   │   ├── single-flight.ts     duplicate-work consolidation
    │   │   └── concurrency.ts       bounded external-work executor
    │   ├── plugins/
    │   │   ├── cors.ts
    │   │   ├── rate-limit.ts
    │   │   ├── request-context.ts
    │   │   └── security.ts
    │   ├── routes/
    │   │   └── health.ts
    │   └── schemas/
    │       └── errors.ts             public response schemas
    └── test/
        ├── unit/                     cache, single-flight, concurrency, config
        └── integration/              app.inject HTTP behavior
```

Infrastructure files may be grouped differently during planning if each file remains cohesive and the public contracts above remain unchanged.

## Code Style

Use named exports, immutable inputs, explicit return types at module boundaries, no `any`, and dependency injection for clocks or side effects used in tests. Files and directories use kebab-case; types and classes use PascalCase; values and functions use camelCase; constants use UPPER_SNAKE_CASE only for true constants.

```ts
export type CacheOptions = Readonly<{
  maxEntries: number;
  now?: () => number;
}>;

export function createCache<Key, Value>(
  options: CacheOptions,
): Cache<Key, Value> {
  // Implementation follows the approved contract and is added test-first.
  return createLruCacheAdapter(options);
}
```

- Prefer small functions and explicit domain names over comments explaining mechanics.
- Use `unknown` at external boundaries and validate before narrowing.
- Do not introduce repository classes, dependency-injection containers or generic base-service hierarchies.
- Route schemas define both runtime validation and TypeScript inference.

## Testing Strategy

### Unit tests

- Environment defaults, coercion and rejection of every invalid configured value.
- TTL expiration, LRU eviction, bounded size, deletion and clearing.
- `SingleFlight` sharing, cleanup after success and cleanup after rejection.
- Concurrency maximum, bounded queue, fail-fast saturation and 5-second queue expiry.
- Internal-error-to-public-envelope mapping.

### Integration tests with `app.inject`

- `/health` status, body, content type and request ID.
- Unknown-route `404` envelope.
- Unexpected-error `500` envelope without stack or internal message.
- Allowed and rejected CORS origins.
- Allowed, rejected and malformed CORS preflights consume the global rate limit; malformed URL paths use the same counter and error envelope.
- Body-size rejection.
- Unsupported media types preserve `415`, while oversized bodies preserve the documented `413`.
- Sixty requests are accepted inside the default window and the next is rejected with `429` and retry headers.
- Rate limits reset using fake time rather than real sleeps.
- Forwarded IP headers do not alter client identity while proxy trust is disabled.
- Logs contain one UUID correlation field, visible request-scoped cache events and safe error classifications while omitting query strings, IPs, coordinates and bodies.

No test performs a real network request or sleeps on wall-clock time. The suite must meet the thresholds and time budgets in `CONSTRAINTS.md`.

## Boundaries

### Always

- Validate environment, HTTP input and external responses at their boundaries.
- Register rate limiting before handlers can perform expensive work.
- Keep `buildApp` independent from `listen` for deterministic tests.
- Return the stable error envelope and request ID for every public error.
- Use bounded caches, queues, payload sizes and concurrency.
- Run the module check before handoff.
- Keep the lockfile authoritative and review dependency changes.

### Ask first

- Add or replace a runtime dependency.
- Change CORS, proxy trust, rate-limit values or public error fields.
- Add a second process, Redis or another persistent service.
- Add telemetry that leaves the process or stores user-identifying data.
- Relax a timeout, queue bound, coverage threshold or security rule.

### Never

- Trust arbitrary forwarding headers or configure unrestricted production proxy trust.
- Use wildcard production CORS.
- Log raw IP addresses, search terms, coordinates, bodies, secrets or cache keys.
- Expose stack traces or dependency payloads.
- Disable validation or rate limiting to make a test pass.
- Depend on process-local cache or limiter state for correctness across instances.
- Retry an external `429` without honoring its retry guidance.

## Success Criteria

- [x] Valid configuration starts one Fastify instance; invalid configuration fails before listening.
- [x] `GET /health` matches the documented contract and performs no external I/O.
- [x] Every response has `x-request-id`; every error has the same ID in its body.
- [x] Validation, not-found, rate-limit, unavailable and unexpected errors match the stable envelope.
- [x] The 61st aggregate request from one normalized IP in a minute receives `429` and retry information, including when requests alternate between route groups.
- [x] Independent route-group counters enforce the approved 30/minute and 15/minute ceilings without replacing the global counter.
- [x] Spoofed forwarding headers do not create new limiter identities when proxy trust is disabled.
- [x] Cache TTL, LRU bounds and `SingleFlight` behavior pass deterministic tests.
- [x] External work never exceeds configured concurrency or an equally bounded waiting queue.
- [x] Logs correlate requests while excluding the prohibited data fields.
- [x] SIGINT and SIGTERM close the server gracefully.
- [x] Build, types, lint, format, tests, coverage and dependency audit pass.
- [x] Coverage and execution time satisfy `CONSTRAINTS.md`.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Per-IP limiting affects multiple users behind one NAT | Keep limits configurable, monitor rejections and let the production edge absorb large bursts |
| Distributed attackers remain below each IP limit | Require managed edge DDoS protection and restrict direct origin access in `production-delivery` |
| In-memory counters reset or multiply across instances | Keep the MVP at one process; require shared state or edge enforcement before scaling |
| IPv6 rotation bypasses naive buckets | Pin `@fastify/rate-limit` 11.2.0+ and test normalized addressing |
| Unbounded unique queries bypass cache benefits | Bound rate, input size, outbound concurrency and queue length |
| Logging leaks location or client data | Allowlist log fields and test captured logs for forbidden values |

## Open Questions

No question blocks this module. Hosting-specific proxy ranges, edge rules, health-check exposure and DDoS provider selection are intentionally deferred to `production-delivery`.

## Official Sources

- Node.js release status: https://nodejs.org/en/about/previous-releases
- Fastify 5 reference: https://fastify.dev/docs/v5.12.x/Reference/
- Fastify 5 JSON Schema requirement: https://fastify.dev/docs/v5.0.x/Guides/Migration-Guide-V5/
- Fastify type providers: https://github.com/fastify/fastify/blob/main/docs/Reference/Type-Providers.md
- Fastify rate-limit plugin: https://github.com/fastify/fastify-rate-limit
- IPv6 rate-limit security advisory: https://github.com/fastify/fastify-rate-limit/security/advisories/GHSA-grpc-p53c-r64v
- Environment schema validation: https://github.com/fastify/env-schema
- Vitest coverage: https://main.vitest.dev/guide/coverage
- OWASP denial-of-service guidance: https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html
- Open-Meteo limits and terms: https://open-meteo.com/en/terms
