<img src="assets/icon.svg" width="64" height="64" alt="">

# PawTrace

PawTrace is a map-based workspace for organizing the search for a missing pet. It brings together an animal profile, named locations, observation histories, search areas, and photo evidence in one case that can be exported as JSON.

## Project status

F01 provides a runnable Angular shell and a NestJS Express API in one Nx workspace, with a Linux Docker Compose runtime. The shell displays the live API connection status and offers retry after a connection failure. Map editing and case features follow in F02–F15.

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

Frontend libraries belong under `libs/web/**`, backend libraries under `libs/api/**`, and the framework-neutral case contract under `libs/shared/case-domain`. These directories will be created as the relevant implementation tasks are completed. PostgreSQL and PostGIS are the intended later database direction.

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

No external token is needed for F01. Real satellite tiles in F02 require a Mapbox account and client token; see the [satellite-provider decision](docs/mvp/issues/12-satellite-provider.md).

Temporary working files belong in `.scratch/`, which is ignored by Git. Durable specifications, research, and prototypes belong in `docs/`.
