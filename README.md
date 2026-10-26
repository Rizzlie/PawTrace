<img src="assets/icon.svg" width="64" height="64" alt="">

# PawTrace

PawTrace is a map-based workspace for organizing the search for a missing pet. It brings together an animal profile, named locations, observation histories, search areas, and photo evidence in one case that can be exported as JSON.

## Project status

F01 provides the Angular/NestJS foundation and Linux Docker runtime. F02 adds a full-workspace Leaflet map, OSM/Mapbox basemap switching, location on demand, and visible recovery from provider failures. Live Mapbox acceptance is pending a configured public token; subsequent case features remain planned.

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

| Area                | Technology / responsibility                                       |
| ------------------- | ----------------------------------------------------------------- |
| Workspace           | Nx                                                                |
| Frontend            | Angular, Signals, and Signal Forms                                |
| Map                 | Leaflet with an isolated map adapter                              |
| Backend             | NestJS with Express for photo assets and the address-search proxy |
| Case contract       | Shared TypeScript models inferred from strict Zod schemas         |
| Browser persistence | IndexedDB through `idb`; complete document snapshots              |
| Local runtime       | Linux containers through Docker Compose                           |

One application-state service owns committed case data, UI state, editor drafts, and save status. Only the committed document is persisted and exported. Photos remain server assets referenced by filename in the case file.

The Leaflet host and adapter live in `libs/web/map-engine`. Further frontend libraries belong under `libs/web/**`, backend libraries under `libs/api/**`, and the framework-neutral case contract under `libs/shared/case-domain`; they will be created as needed. PostgreSQL and PostGIS are the intended later database direction.

## Documentation

- [MVP specification](docs/mvp/spec.md) — product scope and detailed decisions.
- [Frontend architecture](docs/architecture/frontend.md) — state ownership, map integration, JSON flows, and failure-safe persistence.
- [Implementation tasks F01–F15](docs/implementation/README.md) — ordered delivery plan, dependencies, acceptance criteria, and validation.
- [Domain glossary](GLOSSARY.md) — shared terminology.
- [Architecture decisions](docs/adr/) — significant technical trade-offs.
- [Decision map](docs/mvp/map.md) — planning history and decision tickets.
- [Technical research](docs/mvp/research/) — findings, primary sources, and remaining implementation checks.
- [Accepted UI prototype](docs/mvp/prototypes/pawtrace-floating-prototype.html) — visual and interaction reference; uses simulated data and is not the application.

## Getting started

For desktop use, install Docker Desktop with the Linux containers engine (or Docker Engine with the Compose v2 plugin). From the repository root:

```sh
docker compose up --build --wait
```

Open http://localhost:8080. Health is available at http://localhost:8080/api/health and returns `{"status":"ok"}`. One NestJS process serves both the compiled Angular application and the API; no browser API hostname or credentials are required.

```sh
docker compose logs -f pawtrace
docker compose restart pawtrace
docker compose down
```

Optional: copy `.env.example` to `.env` before startup and change `APP_PORT` or `ASSET_DIRECTORY`. Compose reads this file automatically. The default `./data/assets` directory is mounted at `/app/data/assets` for future photo storage and survives container replacement. F01 does not implement uploads or serve this directory. Keep its contents with future case backups. The desktop port binds to loopback; phone/LAN HTTPS setup is deferred.

## Local development

Use Node **24.16.0** (also recorded in `.node-version`) and npm **11.13.0**. Dependencies use exact direct pins and `package-lock.json`; Docker uses the same Node/npm versions. Install and start both applications:

```sh
npm ci
npm run dev
```

Open http://localhost:4200. Angular proxies `/api/**` to NestJS at http://127.0.0.1:3000. Stop both with Ctrl+C. To start them separately, run `npx nx run api:serve` and `npx nx run web:serve` in separate terminals. `API_HOST` and `API_PORT` configure the server; if you change its development port, update `apps/web/proxy.conf.json` too. `WEB_ROOT` optionally enables static frontend serving and is set automatically in Docker. Node development does not automatically load Compose's `.env` file.

## Contributing

Use a dedicated branch for each change, Conventional Commits, and a GitHub PR into `main`. Local hooks enforce formatting, typechecks, tests and commit messages. See [CONTRIBUTING.md](CONTRIBUTING.md) for the complete workflow and GitHub protection settings.

## Checks

```sh
npm run typecheck
npm run lint
npm run build
npm test
npx playwright install chromium
npm run e2e
```

The HTTP integration test starts a real NestJS server on an ephemeral loopback port. Angular tests cover connection success and recovery after a failed request. The Chromium end-to-end test starts both development servers and checks same-origin health, the shell and original icon. To exercise a running container instead, set `BASE_URL=http://127.0.0.1:8080` in your shell before `npm run e2e`; in PowerShell use `$env:BASE_URL='http://127.0.0.1:8080'` and then `Remove-Item Env:BASE_URL` afterwards.

Nx tags enforce browser/API/shared dependency directions. Libraries under `libs/web/**`, `libs/api/**` and `libs/shared/case-domain` will be added when a feature needs them. Signal Forms and the published `linkedSignal` custom setter are available in the pinned Angular baseline; editor-state integration belongs to later tasks. Version-selection references: [Angular compatibility](https://angular.dev/reference/versions), [Nx/Angular matrix](https://nx.dev/docs/kb/angular-nx-version-matrix), [NestJS prerequisites](https://docs.nestjs.com/first-steps), and [linkedSignal API](https://angular.dev/api/core/linkedSignal).

## Map configuration

OSM works without an account or token. The map starts over Poland, supports mouse/keyboard navigation, and offers **Moja lokalizacja** on demand. Location requires browser permission and a secure context (localhost is supported); denial leaves manual navigation available. The accuracy circle and position are temporary, with no continuous tracking. View persistence follows in F05.

Satellite imagery uses Mapbox `satellite-streets-v12` through Static Tiles API with 512-pixel tiles and Leaflet zoom offset -1. Set `MAPBOX_PUBLIC_TOKEN` to your public browser token (`pk.*`) in the ignored `.env` for Compose, then run `docker compose up -d --force-recreate pawtrace`. For Node development set the same environment variable in the terminal before `npm run dev`; `.env` is not automatically loaded by Node. Restart the API and reload the page after changing the token. No frontend rebuild is needed.

`GET /api/map-config` returns this public token to the browser with `Cache-Control: no-store`; private (`sk.*`) tokens are not returned. Browser tokens are visible in network requests. Use account-supported URL restrictions for your actual origin; never use an administrative token or commit local credentials. A missing token, tile error, or 15-second satellite load timeout keeps or restores OSM, preserves the viewport, and displays a message. OSM errors offer a manual retry. Tile-image errors cannot distinguish denied access, quota exhaustion, and network failure, so the message identifies the possible causes without inventing an HTTP status.

Both source URLs and their attribution can be overridden at runtime. Set `OSM_TILE_URL` together with `OSM_ATTRIBUTION`, or `SATELLITE_TILE_URL` together with `SATELLITE_ATTRIBUTION`, in the same environment as the API. Compose forwards all four settings from `.env`. Leave a pair empty to retain its accepted default. Restart/recreate the API and reload the browser after changes; no frontend rebuild is required.

URL templates must use HTTP(S) or a relative path and contain `{z}`, `{x}`, and `{y}`. Satellite templates may contain `{accessToken}`, replaced with the URL-encoded public token; sources without this placeholder need no token. Replacement basic sources must provide 256-pixel XYZ tiles, and satellite sources 512-pixel XYZ tiles (zoom offset -1), within the map's zoom range 3–19. Provide the matching provider's attribution as HTML links; the browser sanitizes the markup before Leaflet displays it. Incomplete/invalid settings display the configuration error and retain the current usable configuration. The Mapbox logo is shown for the Mapbox satellite endpoint. Custom providers remain subject to their own attribution and access requirements.

Provider documentation checked on 2026-10-26: [Static Tiles API](https://docs.mapbox.com/api/maps/static-tiles/), [Mapbox trial limits](https://docs.mapbox.com/accounts/guides/signup/), [attribution requirements](https://docs.mapbox.com/help/ja/dive-deeper/attribution/), and [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/). The card-free trial currently includes 20,000 Static Tiles requests per month, subject to provider changes; no payment method or upgrade is configured. See the [provider decision](docs/mvp/issues/12-satellite-provider.md).

Tiles load directly through the browser, retaining normal HTTP caching and referrer headers. There is no bulk download, offline prefetch, proxy, or automatic satellite retry. OSM attribution remains visible; satellite mode adds Mapbox/OSM/Maxar links, feedback, and the official Mapbox logo (vendored from Mapbox GL JS 3.17.0 CSS). Automated map tests use controlled tile responses and never consume provider quotas. Real OSM tiles were separately verified; real Mapbox imagery still requires account/token verification.

Temporary working files belong in `.scratch/`, which is ignored by Git. Durable specifications, research, and prototypes belong in `docs/`.
