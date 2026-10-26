<img src="assets/icon.svg" width="64" height="64" alt="">

# PawTrace

PawTrace is a map-based workspace for organizing the search for a missing pet. It brings together an animal profile, named locations, observation histories, search areas, and photo evidence in one case that can be exported as JSON.

## Project status

The repository currently contains the MVP specification, architecture, implementation tasks, and standalone UI prototypes. Application implementation has not started; runnable application and Docker setup will be introduced in **F01**.

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

## Planned architecture

| Area | Technology / responsibility |
| --- | --- |
| Workspace | Nx |
| Frontend | Angular, Signals, and Signal Forms |
| Map | Leaflet with an isolated map adapter |
| Backend | NestJS with Express for photo assets and the address-search proxy |
| Case contract | Shared TypeScript models inferred from strict Zod schemas |
| Browser persistence | IndexedDB through `idb`; complete document snapshots |
| Local runtime | Linux containers through Docker Compose |

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

Start with the specification and frontend architecture, then use the implementation task index. A request such as **“implement F01”** refers to the corresponding task document and its prerequisites.

To inspect the visual prototype, open `docs/mvp/prototypes/pawtrace-floating-prototype.html` directly in a browser. It does not provide real map services or durable case storage.

Application installation and Docker commands will be documented when F01 provides the runnable workspace. Real satellite tiles will require a Mapbox account and client token; provider configuration and usage constraints are described in the [satellite-provider decision](docs/mvp/issues/12-satellite-provider.md).

Temporary working files belong in `.scratch/`, which is ignored by Git. Durable specifications, research, and prototypes belong in `docs/`.
