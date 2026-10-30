<img src="assets/icon.svg" width="64" height="64" alt="">

# PawTrace

PawTrace is a map-based workspace for organizing the search for a missing pet. It brings together an animal profile, named locations, observation histories, search areas, and photo evidence in one case that can be exported as JSON.

## Project status

P01 adds Google login and PostgreSQL-backed sessions, and P02 adds private cases stored in PostgreSQL/PostGIS. This is an incomplete private integration: ownerless photo endpoints are denied, and photo ownership and account-keyed recovery arrive in P03–P04. Follow the [P01 runtime and verification notes](docs/post-mvp/p01-authentication.md) before using the historical MVP runbook below; anonymous startup instructions no longer describe this branch.

The desktop MVP (implementation tasks F01–F15) is complete: Angular/NestJS Docker runtime, OSM/Mapbox map, submitted address search, strict JSON v1 contract, browser autosave/transfer, animal profile, named points and history, planned search areas and actual-search snapshots, persistent original photos with thumbnails and HEIC previews, photo attachments, and context-preserving filters. F15 verified the complete flow and its failure paths; see the [runbook](#runbook) and [known limitations](#known-tested-limitations).

The initial release targets a desktop browser, local Docker deployment, and searches within Poland. Phone-specific refinement follows the desktop version.

## MVP scope

- Record an animal's appearance, distinguishing features, and disappearance circumstances.
- Create named map points by clicking the map, dragging a marker, or searching for an address.
- Maintain multiple dated observations, actions, checks, and notes at each point.
- Distinguish confirmed sightings, uncertain sightings, and sightings of a different animal.
- Draw search areas and preserve the history of actual searches.
- Attach photos to observations, retaining originals on the local server.
- Switch between standard OpenStreetMap tiles and Mapbox satellite imagery.
- Automatically save one case in the browser and export or import its complete JSON document.

AI analysis and suggested search locations are planned for a later stage. Database-backed cases, authentication, and automatic cross-device synchronization are also outside the MVP.

## Architecture

| Area             | Technology / responsibility                                       |
| ---------------- | ----------------------------------------------------------------- |
| Workspace        | Nx                                                                |
| Frontend         | Angular, Signals, and Signal Forms                                |
| Map              | Leaflet with an isolated map adapter                              |
| Backend          | NestJS with Express for photo assets and the address-search proxy |
| Case contract    | Shared TypeScript models inferred from strict Zod schemas         |
| Case persistence | PostgreSQL/PostGIS through the owned case API                     |
| Local runtime    | Linux containers through Docker Compose                           |

One application-state service owns committed case data, UI state, editor drafts, and save status. Only the committed document is persisted and exported. Photos remain server assets referenced by filename in the case file.

The Leaflet host and adapter live in `libs/web/map-engine`; the framework-neutral case contract lives in `libs/shared/case-domain` and is exported as `@pawtrace/case-domain`. Further frontend libraries belong under `libs/web/**` and backend libraries under `libs/api/**`; they will be created as needed. PostgreSQL and PostGIS are the intended later database direction.

## Documentation

- [Shared-instance release specification](docs/post-mvp/spec.md) and [accepted tasks](docs/post-mvp/tasks/README.md) — accepted post-MVP plan for Google login, private relational cases, offline recovery and ZIP transfer; not yet implemented.
- [MVP specification](docs/mvp/spec.md) — product scope and detailed decisions.
- [Frontend architecture](docs/architecture/frontend.md) — state ownership, map integration, JSON flows, and failure-safe persistence.
- [Case JSON v1](docs/architecture/case-json-v1.md) — implemented fields, vocabulary, validation rules, and example files.
- [Implementation tasks F01–F15](docs/implementation/README.md) — ordered delivery plan, dependencies, acceptance criteria, and validation.
- [Domain glossary](GLOSSARY.md) — shared terminology.
- [Architecture decisions](docs/adr/) — significant technical trade-offs.
- [Decision map](docs/mvp/map.md) — planning history and decision tickets.
- [Technical research](docs/mvp/research/) — findings, primary sources, and remaining implementation checks.
- [Accepted UI prototype](docs/mvp/prototypes/pawtrace-floating-prototype.html) — visual and interaction reference; uses simulated data and is not the application.

## Runbook

### Install and start

For desktop use, install Docker Desktop with the Linux containers engine (or Docker Engine with the Compose v2 plugin). From the repository root:

```sh
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
docker compose up --build --wait
```

Open http://localhost:8080. Health is available at http://localhost:8080/api/health and returns `{"status":"ok"}`. One NestJS process serves both the compiled Angular application and the API; Redis runs beside it as the address-search cache. No browser API hostname or credentials are required. The first build compiles the HEIC codecs and takes several minutes; later builds reuse Docker's layer cache.

### Configuration and private token

Compose reads the ignored `.env` file automatically. Ordinary settings are `APP_PORT` (default 8080, loopback only), `ASSET_DIRECTORY` (default `./data/assets`) and `REDIS_PORT`. Compose also publishes Redis on loopback port `REDIS_PORT` (default 6379) for Node development; if another Redis already uses that port, `up` fails, so set a free port in `.env` (the application itself uses the internal Redis address). OSM and address search work without an account. For satellite imagery, put your **public** Mapbox token (`pk.*`) into `MAPBOX_PUBLIC_TOKEN` in `.env`, never in a committed file, chat or issue, and apply it with `docker compose up -d --force-recreate pawtrace`. Never use a secret (`sk.*`) token. See [Map configuration](#map-configuration) for provider overrides and [Address search](#address-search) for the geocoder settings.

### Everyday operation (non-destructive)

| Task                       | Command                                          |
| -------------------------- | ------------------------------------------------ |
| Follow logs                | `docker compose logs -f pawtrace`                |
| Restart the application    | `docker compose restart pawtrace`                |
| Apply `.env` changes       | `docker compose up -d --force-recreate pawtrace` |
| Update after `git pull`    | `docker compose up -d --build --wait`            |
| Stop, keeping containers   | `docker compose stop`                            |
| Stop and remove containers | `docker compose down`                            |
| Start again                | `docker compose up -d --wait`                    |

None of these touches case or photo data. `down`, recreation and rebuilds keep the asset directory (a host bind mount) and the `redis-data` cache volume.

### Where data lives

| Data                   | Location                                                | Notes                                                                         |
| ---------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Cases                  | PostgreSQL/PostGIS Docker volume                        | Private to the signed-in owner; the same cases open from any browser.         |
| Photos and derivatives | `ASSET_DIRECTORY` on the host (default `./data/assets`) | One UUID directory per original, with `metadata.json`, thumbnail and preview. |
| Address-search cache   | Docker volume `<project>_redis-data`                    | Disposable cache only; not part of a backup.                                  |

### Backup

1. In the browser, open the **JSON** menu (accessible name “Plik JSON”), choose **Eksportuj JSON** and keep the downloaded `pawtrace-<case-id>.json`. Export works even when the save indicator reports a failure.
2. Stop the application so no upload or derivative is half-written: `docker compose stop pawtrace`.
3. Copy the **complete** asset directory, including every `metadata.json`:
   - sh: `cp -a data/assets backup/assets-2026-10-29`
   - PowerShell: `Copy-Item -Recurse data\assets backup\assets-2026-10-29`
4. Start again: `docker compose start pawtrace`.

JSON without the asset directory restores all case data but shows photos as unavailable; the asset directory without JSON contains photos but no case.

### Restore (same or another machine)

1. Stop the application: `docker compose stop pawtrace` (or skip on a fresh installation).
2. Copy the backed-up asset directory into the configured `ASSET_DIRECTORY`. Asset directories have unique UUID names, so copying into a directory that already contains other photos merges them. Alternatively point `ASSET_DIRECTORY` in `.env` at the restored copy.
3. Start: `docker compose up -d --wait`.
4. In the browser, open the **JSON** menu, choose **Importuj JSON**, check the summary and choose **Zastąp sprawę**. The confirmation offers an export of the case being replaced.

Photos whose files are missing remain referenced and show as unavailable.

### Destructive removal

These commands delete data permanently. Export JSON and back up the assets first.

- Delete all photos: remove the contents of `ASSET_DIRECTORY` (`./data/assets`). Compose never deletes this bind-mounted directory, not even with `down --volumes`.
- Delete the case in a browser: clear site data for the PawTrace origin in browser settings, or replace it with **Nowa sprawa**.
- Delete the address cache: `docker compose down --volumes` removes `redis-data`. This deletes only cached geocoder responses.
- Remove the built images: `docker compose down --rmi local`. The next start rebuilds them.

### Known tested limitations

Verified on Windows 11 with Docker Desktop (Linux containers) and Chromium on 2026-10-29; see [F15 completion notes](docs/implementation/F15-mvp-acceptance.md#completion-notes).

- Desktop browser first. Phone layouts are usable at 390 px, but phone refinement, physical gestures and LAN/HTTPS access are not yet supported; the port binds to loopback.
- One case per browser profile and origin, no cross-device synchronization or multi-tab editing lock. Clearing site data deletes the case unless you exported it.
- One application instance per asset directory and one API process against the public Nominatim service (one request per second, no autocomplete).
- Mapbox satellite needs your public token and is limited by the provider's free monthly quota; tile errors fall back to OSM without diagnosing the cause.
- Multi-image HEIC files show one still primary image; frame browsing and animation are not supported. Only photos can be attached (no video, audio or documents).
- Ungraceful kills can leave unpublished partial upload directories; there is no automatic cleanup. A Linux host directory must be writable by the container's `node` user (UID 1000). This was not exercised on a Linux host.

## Local development

Use Node **24.16.0** (also recorded in `.node-version`) and npm **11.13.0**. Dependencies use exact direct pins and `package-lock.json`; Docker uses the same Node/npm versions. Install and start both applications:

```sh
npm ci
docker compose up -d --wait redis
npm run dev
```

Open http://localhost:4200. Angular proxies `/api/**` to NestJS at http://127.0.0.1:3000. Stop both with Ctrl+C. To start them separately, run `npx nx run api:serve` and `npx nx run web:serve` in separate terminals. `API_HOST` and `API_PORT` configure the server; if you change its development port, update `apps/web/proxy.conf.json` too. `WEB_ROOT` optionally enables static frontend serving and is set automatically in Docker. NestJS `ConfigModule` loads the root `.env` when starting from the repository root; shell/container settings take precedence. `ConfigService` exposes the Zod-validated configuration, including numeric ports, HTTP(S) geocoder/attribution URLs and a Redis URL. Invalid configuration stops startup with field names only.

## Contributing

Use a dedicated branch for each change, Conventional Commits, and a GitHub PR into `main`. Local hooks enforce formatting, typechecks, tests and commit messages. See [CONTRIBUTING.md](CONTRIBUTING.md) for the complete workflow and GitHub protection settings.

## Checks

```sh
docker compose up -d --wait redis
npm run typecheck
npm run lint
npm run build
npm test
npx playwright install chromium
npm run e2e
```

The HTTP integration tests start a real NestJS server on an ephemeral loopback port. The Chromium suite starts both development servers and drives every feature through the UI against the real API, with controlled tile, map-configuration and geocoder responses so it never consumes provider quotas. `apps/web-e2e/src/mvp-acceptance.spec.ts` is the cross-feature MVP acceptance flow: from an empty case to photos, filters, reload and JSON round-trip, plus a run with every provider and photo unavailable. Run only that flow with `npm run e2e -- mvp-acceptance`. To exercise a running container instead, set `BASE_URL=http://127.0.0.1:8080` in your shell before `npm run e2e`; in PowerShell use `$env:BASE_URL='http://127.0.0.1:8080'` and then `Remove-Item Env:BASE_URL` afterwards.

With Docker running, `npm exec -- nx run api:verify-images` and `npm exec -- nx run api:verify-assets` check the production image's native HEIC processing and original-photo storage (see [Original-photo storage](#original-photo-storage)).

Nx tags enforce browser/API/shared dependency directions. Version-selection references: [Angular compatibility](https://angular.dev/reference/versions), [Nx/Angular matrix](https://nx.dev/docs/kb/angular-nx-version-matrix), [NestJS prerequisites](https://docs.nestjs.com/first-steps), and [linkedSignal API](https://angular.dev/api/core/linkedSignal).

## Map configuration

OSM works without an account or token. The map starts over Poland, supports mouse/keyboard navigation, and offers **Moja lokalizacja** on demand. Location requires browser permission and a secure context (localhost is supported); denial leaves manual navigation available. The accuracy circle and position are temporary, with no continuous tracking. View persistence follows in F05.

Satellite imagery uses Mapbox `satellite-streets-v12` through Static Tiles API with 512-pixel tiles and Leaflet zoom offset -1. Set `MAPBOX_PUBLIC_TOKEN` to your public browser token (`pk.*`) in the ignored `.env` for Compose, then run `docker compose up -d --force-recreate pawtrace`. Node development reads the same `.env` through NestJS ConfigModule; an exported shell variable takes precedence. Restart the API and reload the page after changing the token. No frontend rebuild is needed.

`GET /api/map-config` returns this public token to the browser with `Cache-Control: no-store`; private (`sk.*`) tokens are not returned. Browser tokens are visible in network requests. Use account-supported URL restrictions for your actual origin; never use an administrative token or commit local credentials. A missing token, tile error, or 15-second satellite load timeout keeps or restores OSM, preserves the viewport, and displays a message. OSM errors offer a manual retry. Tile-image errors cannot distinguish denied access, quota exhaustion, and network failure, so the message identifies the possible causes without inventing an HTTP status.

Both source URLs and their attribution can be overridden at runtime. Set `OSM_TILE_URL` together with `OSM_ATTRIBUTION`, or `SATELLITE_TILE_URL` together with `SATELLITE_ATTRIBUTION`, in the same environment as the API. Compose forwards all four settings from `.env`. Leave a pair empty to retain its accepted default. Restart/recreate the API and reload the browser after changes; no frontend rebuild is required.

URL templates must use HTTP(S) or a relative path and contain `{z}`, `{x}`, and `{y}`. Satellite templates may contain `{accessToken}`, replaced with the URL-encoded public token; sources without this placeholder need no token. Replacement basic sources must provide 256-pixel XYZ tiles, and satellite sources 512-pixel XYZ tiles (zoom offset -1), through native map zoom 19; display zoom 20–22 scales those existing tiles. Provide the matching provider's attribution as HTML links; the browser sanitizes the markup before Leaflet displays it. Incomplete/invalid settings display the configuration error and retain the current usable configuration. The Mapbox logo is shown for the Mapbox satellite endpoint. Custom providers remain subject to their own attribution and access requirements.

Provider documentation checked on 2026-10-26: [Static Tiles API](https://docs.mapbox.com/api/maps/static-tiles/), [Mapbox trial limits](https://docs.mapbox.com/accounts/guides/signup/), [attribution requirements](https://docs.mapbox.com/help/ja/dive-deeper/attribution/), and [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/). The card-free trial currently includes 20,000 Static Tiles requests per month, subject to provider changes; no payment method or upgrade is configured. See the [provider decision](docs/mvp/issues/12-satellite-provider.md).

Tiles load directly through the browser, retaining normal HTTP caching and referrer headers. There is no bulk download, offline prefetch, proxy, or automatic satellite retry. OSM attribution remains visible; satellite mode adds Mapbox/OSM/Maxar links, feedback, and the official Mapbox logo (vendored from Mapbox GL JS 3.17.0 CSS). Automated map tests use controlled tile responses and never consume provider quotas. Real OSM tiles, Mapbox satellite imagery and Nominatim search were checked manually with a few requests (latest on 2026-10-29).

Tile caching uses the browser's HTTP memory/disk cache, honoring the provider's `Cache-Control`, `Expires`, `Age` and validators such as `ETag`. A fresh cached response can be reused without a provider request; an expired response may require revalidation or download. Cache retention also depends on the browser and available storage. There is no application-owned tile cache in IndexedDB, Cache Storage, the API or Docker, and no offline guarantee. The API's `no-store` header applies to `/api/map-config`; tile images receive their own provider headers.

OSM's policy accepts normal browser HTTP caching. A small OSM HEAD check on 2026-10-26 confirmed cache-control and ETag headers; its TTL is provider-controlled, not hardcoded in PawTrace. Mapbox Static Tiles currently documents `max-age=43200` (12 hours for the browser) and a separate shared/CDN TTL. The `keepBuffer: 0` Leaflet option limits offscreen tile elements; it does not disable HTTP caching or prefetch extra tiles. Only changes to the active source or an explicit retry replace a layer; equivalent configuration, inactive-source changes and loading/error signal updates retain it. Automated tests with routed tile responses verify behavior, not the browser's real HTTP cache hit rate.

## Case files and browser saving

Use **Nowa sprawa** to create a case or **Importuj JSON** to open a PawTrace JSON v1 file. The confirmation shows the incoming case and its record counts, offers an export of the current case, and allows cancellation. Replacement succeeds only after the candidate is safely stored; invalid files and failed writes leave the active case intact. Import preserves all fields, including information whose editing interface is planned for later tasks.

The current case and map view restore after refreshing or reopening the same browser profile at the same origin. **Zapisano w przeglądarce** means the transaction completed. If saving fails, keep the page open and use **Eksportuj JSON** to download the latest in-memory data or **Ponów zapis** to retry. The next committed change also retries; there is no automatic retry timer. Invalid stored data is retained and presents recovery options instead of being silently overwritten.

JSON export is a complete manual backup/transfer of committed case data, independent of view filters or save failures. It contains server-photo filenames, not the image files. Browser data is local to its profile and origin (host, protocol and port); clearing site data removes it. There is no automatic cross-device synchronization or cross-tab editing lock. Live Mapbox acceptance remains a separate F02 check and was explicitly excluded as a prerequisite for implementing F05.

## Address search

Type a Polish address and use Enter or **Szukaj**, then choose a result to move the map. Selecting a result creates no case point. Loading, no-results and provider-error feedback leave manual map navigation available. Search input goes to the geocoder; enter address information only, without personal or case-history text.

The accepted public [Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/) requires explicit user-triggered searches, application identification, attribution, caching, and at most one upstream request per second across all users. No autocomplete, bulk lookup or automatic retries are implemented. Availability is not guaranteed. Keep this local deployment to **one API process/replica**: its singleton queue serializes requests and waits at least a second after each response. Do not run multiple independent PawTrace instances against the public service; a larger deployment requires one shared gateway or a different provider.

`GET /api/address-search?q=...` accepts 2–200 characters and sends only the normalized query plus fixed Poland/language/format/result-limit parameters. The response contains `results` (`id`, `label`, `latitude`, `longitude`) and provider `attribution`. It does not accept or forward case data. Successful and empty results are cached for 24 hours through NestJS `CacheModule`/`CACHE_MANAGER`, using the `@keyv/redis` store without an in-memory fallback; concurrent duplicates share one request. Cache entries survive API restarts. Keys include the provider configuration and normalized query, hashed with SHA-256; provider changes cannot reuse an old provider's result/attribution. Cache failure returns 503 before contacting the geocoder. At most 50 distinct searches can be pending; overload returns 503. Upstream calls time out after 10 seconds; provider 429/503 responses defer subsequent calls according to `Retry-After` (60 seconds if missing). Failures are not cached. The browser gives up after 30 seconds and offers manual resubmission, without an automatic retry loop.

Configure `ADDRESS_SEARCH_URL` (a Nominatim-compatible `/search` endpoint), `ADDRESS_SEARCH_USER_AGENT`, `ADDRESS_SEARCH_ATTRIBUTION` (plain text), and `ADDRESS_SEARCH_ATTRIBUTION_URL` (HTTP(S)) on the server. Defaults are in `.env.example`; Compose forwards these settings and Node development loads them via NestJS ConfigModule. Restart/recreate the API to switch provider without rebuilding the browser. The server sends the configured identification, never browser cookies or case history, and refuses upstream redirects.

Compose starts Redis alongside the API, waits for its healthcheck and keeps its append-only data in the `redis-data` named volume. Redis has a 64 MB technical memory budget with LRU eviction; cached data can be evicted before its TTL and is not a case backup. `docker compose down` preserves the cache volume. For Node development and API tests start only `docker compose up -d --wait redis`; it exposes a loopback-only port (`REDIS_PORT`, default 6379). `REDIS_URL` defaults to `redis://127.0.0.1:6379`; if changing `REDIS_PORT`, update the URL too. Compose supplies the API with its internal `redis://redis:6379` URL. Redis connection/queued-command limits and socket inactivity timeout are one second, with automatic reconnection disabled; a stalled read or write returns 503 and releases the search queue, allowing recovery on explicit resubmission. The GitHub quality job starts a separate Redis service for HTTP integration tests. Redis shares cached responses, but does not distribute the request queue: retain one API process against public Nominatim.

Temporary working files belong in `.scratch/`, which is ignored by Git. Durable specifications, research, and prototypes belong in `docs/`.

## Map points

Use **Dodaj punkt** in the right map toolbar beside **Moja lokalizacja**, click the map or submit an address search, and name the place. Drag the orange draft marker or correct its geographic coordinates, select zero or more predefined roles, and choose **Zapisz punkt** or **Anuluj punkt**. Address search outside point editing only moves the map. Saved points can be selected from markers or the collapsible **Miejsca** list; overlapping markers offer a choice of names. List rows and markers show matching numbers derived from the place order; deleting a place renumbers the remaining display labels without changing their IDs. The phone list starts collapsed.

Edit a selected place to rename/reposition it without changing its ID or imported history/photos. **Miejsce ucieczki** updates the same single incident reference used by the profile. Switching dirty editors or replacing the case offers Save / Discard / Stay. Export includes committed data only.

Removal asks for confirmation with the history-entry count. It removes the point and its history, clears its escape assignment, and retains unrelated places, areas and all asset filenames. Checks linked to deleted observations retain their records, geometry and photos; their result becomes `other_or_inconclusive`, with the prior sighting and removed observation ID recorded in the description. No server photo file is deleted.

Map display zoom now supports 3–22. Beyond 19, Leaflet enlarges the existing tiles, so places can be positioned and separated more closely without requesting unsupported tile levels. This adds no imagery detail. The closer viewport is saved/restored and included in JSON; older application versions limited to zoom 19 may reject such a file.

## Point history

Select a place and choose **Dodaj wpis** to record an observation, action, check or note. Each type shows its relevant fields. **Zapisz wpis** validates and commits the draft; **Anuluj wpis** discards it. Existing entries retain their type, ID, creation time and photo filenames. Editing and removal are available on each history card. Removing an observation keeps linked checks with an explanatory note and an inconclusive result; original photo files remain untouched.

An observation has its own source, optional location-uncertainty radius and identification: searched-for animal, uncertain or different animal. Different-animal sightings remain visible. Manual rejection requires a reason and is independent of identification. Colored marker rings and the opened place's counts distinguish outcomes, including mixed observations. F08 counts the complete history; filter-dependent counts arrive in F14.

Event time can be exact, approximate, a range with either endpoint unknown, date only or unknown. Keep the original verbal description. Local date/time inputs use the case's time zone; repeated daylight-saving hours require an explicit occurrence, and nonexistent hours are rejected. History sorts newest local calendar days first, using the known instant (range start, otherwise end) within a day; date-only entries follow timed entries for that day. Creation time and then stable ID break ties, including in the separate **Nieznany czas** section. This is display ordering, not invented event precision.

Food placement/refill details and food-status checks remain independent records in the place's history. Missing food does not assert the target animal's presence. Recording **Zwierzę odnalezione i zabezpieczone** keeps the case editable and exportable. JSON transfer and browser autosave include all committed history; photo upload/viewing comes in F13.

## Original-photo storage

The API can store JPEG, PNG, WebP and HEIC originals independently of case data. It generates PNG thumbnails and full-resolution HEIC previews in a separate processing process. Photo controls arrive in F13. Format recognition uses file content; it does not promise that every recognizable file can be decoded.

- `POST /api/assets`: send one multipart file named `file`; HTTP 201 returns its unique `filename`, original metadata and derivative states. Send additional photos as independent requests. Only successful original filenames should enter case `photos` lists. The response's `processing` field belongs to the asset interface, not the exported case JSON schema.
- `GET /api/assets/:filename/metadata`: fetch metadata and current derivative states without caching them.
- `GET /api/assets/:filename`: stream the unchanged original as an attachment. Missing files return 404. Failed original writes return a retryable HTTP 507 error without a successful filename; malformed multipart requests return 400 and unsupported content 415.
- `GET /api/assets/:filename/thumbnail` and `GET /api/assets/:filename/preview`: stream a ready PNG derivative. Thumbnails fit inside 480 × 480 pixels without enlargement; HEIC previews retain the oriented full-image dimensions. Unavailable/not-required derivatives return 404; read metadata for their state.
- `POST /api/assets/:filename/retry`: retry failed derivatives using the same saved original. Completed derivatives remain ready; original bytes and case photo references never change. Derivative failure is a warning on a successful attachment, not an upload failure.

The production Linux image builds Sharp 0.35.5 against libvips 8.18.7, libheif 1.23.7 and libde265 1.1.3. Its disk-backed queue admits one child decoder at a time and resumes pending work after restart. `IMAGE_PROCESSING_TIMEOUT_MS` defaults to 60000 per derivative. V8 heap limits do not cap native memory; worker and API share a container memory cgroup. PNG previews do not promise identical HDR rendering. See [photo processing](docs/architecture/image-processing.md) for the interface, runtime, constraints and verification.

`ASSET_DIRECTORY` defaults to `./data/assets` for Node development. Compose already binds the host directory to `/app/data/assets`. Each server-generated UUID reserves one directory containing the original and `metadata.json`; incomplete writes have no final metadata marker and cannot be retrieved. Do not expose this directory with a separate static-file server. Unlinking a case photo never removes server files. To back up or transfer a case with its photos, copy its JSON **and the complete asset directory**, including metadata, while uploads are stopped. JSON alone does not copy images.

There is no product photo-count or MB cap. Actual disk/inode availability, permissions, network failure, parser header limits and Node's 300-second request/60-second header timeouts still apply. The Compose route has no buffering reverse proxy; uploads stream to disk and originals stream back. Successfully saved originals survive derivative failures. Hard kills can leave unpublished partial directories; automatic cleanup and guarantees against host power loss are outside this slice.

With Docker running, `npm exec nx run api:verify-assets` builds the production image and checks original hashes, container-replacement persistence, read-only storage, real disk-full failures and recovery. It uses isolated temporary containers and preserves the ordinary Compose deployment.

`npm exec -- nx run api:verify-images` verifies real HEIC decoding, preview dimensions/orientation, original hashes, processing retries, worker interruption, restart recovery and resource failures in the production image. Back up the full asset directory together with case JSON while uploads and processing are stopped. Use one application instance per asset directory.
