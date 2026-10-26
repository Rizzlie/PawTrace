# F03 — Address search through the local API

Status: done
Depends on: F01, F02

## Goal

Search Polish addresses on explicit submission and move the real map to a selected result. The same search result interface will support point placement in F07.

## Read first

- [Frontend architecture](../architecture/frontend.md), including library boundaries, editor ownership, and JSON/persistence flows.
- [Execution guide](README.md), [F01](F01-workspace-and-docker.md), and [F02](F02-map-and-basemaps.md).
- [Current architecture](../mvp/issues/10-local-architecture.md).
- [Nominatim findings and primary-source policy links](../mvp/research/technical-feasibility.md), section 2. Read the current provider policy before integrating.

## Scope

1. Add a dedicated NestJS address-search endpoint with input validation, Poland-restricted queries, application identification, and a configurable upstream.
2. Implement a shared request queue and cache that respect the public Nominatim policy, including at most one request per second for the application. Repeated queries should reuse cached results; the client does not contact the upstream directly.
3. Add a search field with submit/Enter, loading, selectable results, no-results, and service-error states. Typing alone makes no upstream requests.
4. Return explicit geographic coordinates and useful result labels. Selecting a result repositions the map without creating a case point.
5. Define a small reusable result-selection interface for F07, so point placement can consume the same result without a second search integration.

## Acceptance criteria

- Submitted search returns selectable Polish locations and repositions the map.
- Typing and ordinary map panning do not trigger geocoding.
- Concurrent clients use the shared queue; cached queries avoid unnecessary upstream calls.
- Network/rate-limit/no-result errors leave manual navigation usable and do not trigger an automatic retry loop.
- Only address-query information is sent upstream; case history is not part of the request.

## Validation

Use controlled upstream responses to verify queue spacing, caching, error handling, and selection. Perform a small policy-compliant real search as an integration check. Verify that selecting a result alone creates no point and that the provider can be changed by configuration.

## Architecture integration

Keep address-search UI/client integration in web features and proxy implementation in API code. A selected search result proposes draft coordinates; it does not bypass point confirmation or create a second case state.

## Completion notes

Implemented and verified on 2026-10-26 on `feat/f03-address-search`.

The singleton NestJS `/api/address-search?q=...` endpoint validates input, sends an identified Poland-restricted Nominatim request, validates provider results, and returns explicit latitude/longitude, labels, stable OSM identities and attribution. Its shared serial queue waits at least one second after the preceding response; concurrent normalized duplicates share one request. Successful and empty results use NestJS `CacheModule`/`CACHE_MANAGER` with `@keyv/redis`, a 24-hour TTL and no in-memory fallback. Compose persists Redis data and bounds its memory through LRU eviction. Redis failures return a service error before contacting the geocoder. Failures remain retryable through explicit submission; 429/503 observe `Retry-After`, with a conservative fallback delay. The README documents the single-process queue boundary, cache lifetime, technical queue capacity and timeouts.

`libs/web/workspace` contains the Signal Forms search UI and same-origin client, with loading, results, no-results and error feedback. Typing and map navigation do not geocode. Selecting a result moves the existing Leaflet map at zoom 15 and emits the exported `AddressSearchResult` through `resultSelected`; it creates no marker or case point. F07 can consume the same selection for draft coordinates and explicit confirmation. Search data is transient UI state; no case store or document model was introduced. Results for an edited query are hidden until that query is explicitly submitted.

Provider endpoint, application identification and text/link attribution are runtime environment settings forwarded by Compose. A Nominatim-compatible provider can be switched by restarting the API, without rebuilding the browser. The current [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/) was checked before integration; only address-query information and fixed geocoder parameters are forwarded, with no browser cookies, case history, autocomplete or automatic retry loop.

Following the user's refinement, NestJS `ConfigModule` loads `.env`, and all API runtime settings (including map settings, host/port and static root) are read through `ConfigService`. A Zod schema validates/coerces values and supplies defaults before application creation. Shell/container settings override `.env`. Invalid settings fail startup with field names, without exposing raw values. Pins remain compatible with the existing NestJS 11/CommonJS runtime: `@nestjs/config` 4.0.4, `@nestjs/cache-manager` 3.1.3, `cache-manager` 7.2.9, Keyv 5.6.0 and Redis adapter 5.1.6; configuration validation uses Zod 4.6.7.

Validation:

- `npx nx run api:test --run src/address-search.spec.ts --output-style=static`: 19 controlled-upstream HTTP tests pass against real Redis, covering country restriction, identification, validation, concurrency, spacing, persistent cache across API restarts, Redis outage, stalled reads/writes, empty results, malformed responses, provider failures and queue recovery. Initial red runs showed the missing endpoint, missing queue/cache, unhandled `Retry-After`, loss of cache across restart and indefinite waits for stalled Redis operations before their implementation slices.
- `npx nx run api:test --run src/configuration.spec.ts --output-style=static`: seven startup/HTTP checks pass for `.env` loading, shell precedence and Zod rejection of invalid settings without exposing values.
- `npx nx run-many -t typecheck lint --output-style=static`: all configured targets pass across the five projects.
- `npx nx run-many -t test --output-style=static`: full unit/integration suite passes across API, web and map-engine.
- With `BASE_URL=http://127.0.0.1:8080`, `npx nx run web-e2e:e2e --output-style=static`: all 16 Chromium tests pass against the rebuilt Docker application, including three address-search scenarios and existing map/shell regression checks. The new selection scenario initially failed because no address field existed. Earlier verification used the production browser build on port 4303, leaving already-running development servers on 3000/4200 intact.
- The e2e prerequisite production builds pass. Angular reports a non-blocking initial bundle warning (about 512 kB against a 500 kB warning threshold); the error budget remains satisfied.
- `docker compose config --quiet`, `docker compose up --build --wait`: pass. Clean Linux dependency installs and production builds succeed; the API and Redis are healthy. Redis also starts independently through `docker compose up -d --wait redis` for Node development/tests.
- One real manually submitted query, `Warszawa, plac Zamkowy`, through the local proxy returned HTTP 200 with Plac Zamkowy at approximately latitude 52.24841, longitude 21.01444. Browser inspection confirmed its selected label, attribution and map repositioning. Other address tests use controlled responses, not the public service.
- Independent code-review axes against initial HEAD `1e30a39` passed the initial implementation. A second review after the Redis/config refinement found no Standards issues and one Spec issue: connection timeouts did not bound established Redis operations. Added queued-command/socket-inactivity timeouts plus HTTP regressions for stalled reads/writes and explicit recovery.
- Final review of the Redis timeout fix and complete F03 diff: Standards and Spec both report no actionable findings.

The existing F02 live Mapbox/token acceptance remains pending and unchanged. F03's address workflow was verified with OSM; no satellite credential is required for this feature.
