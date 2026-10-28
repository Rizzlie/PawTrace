# PawTrace implementation tasks

Use this index when the user asks to implement an identifier such as `F01`. Open the matching task file, read this execution guide, and follow that task's specification pointers. These are implementation tasks; the numbered decision tickets under `docs/mvp/issues/` remain the product specification.

F01–F08 are implemented and verified. The user confirmed live Mapbox operation on 2026-10-28, closing F02's remaining external acceptance blocker. F09–F15 remain `planned`; task documents alone do not implement application features.

## Execution guide

1. **Find the requested task.** `F01` identifies exactly one file below. Read its goal, dependencies, scope, acceptance criteria, and validation before editing application code.
2. **Check prerequisites.** Inspect both dependency status and the actual implementation. If a required dependency is absent or broken, report the specific prerequisite and keep the requested task incomplete. Implement only the requested task rather than silently expanding into the entire backlog.
3. **Read the current decisions.** Follow the task's links to the `Answer` sections. The later refinement decisions supersede historical proposals in `Comments`. The [MVP plan](../mvp/spec.md), [glossary](../../GLOSSARY.md), and [NestJS ADR](../adr/0001-use-nestjs-in-the-nx-workspace.md) provide shared context. The prototype is a visual reference with simulated behavior, not production code.
4. **Implement a usable slice.** Integrate the requested behavior with existing code and the browser-owned case model. Keep case/domain contracts independent of Angular, Leaflet, Nest decorators, filesystems, and future database entities. Resolve routine implementation details from the repository and current primary documentation.
5. **Verify the task.** Run checks appropriate to the change and exercise the task's acceptance cases. External-service tests must be small and comply with provider policies; deterministic tests should use controlled responses. Record configuration-dependent checks that could not be completed rather than claiming they passed.
6. **Leave a clear handoff.** Set the task to `done` only when its acceptance criteria and required validation are satisfied. Add concise completion notes with the changed behavior, commands/check results, and any remaining limitations. Update the index status for that task. A blocked external check stays visible in the task and prevents an unqualified completion claim.

The user's instruction remains in effect: **do not create new commits** unless subsequently authorized. These tasks do not request pushing, PR creation, or publication. Preserve existing user changes. Paid plans, payment cards, database setup, and authentication are outside the accepted MVP scope.

Task statuses: `planned`, `in_progress`, `blocked`, `done`. Dependencies are prerequisites, not permission to implement all of them in one invocation. To work in order, choose the first incomplete task whose dependencies are complete.

## Implementation order

1. [F01 — Nx workspace and local Docker runtime](F01-workspace-and-docker.md) — done. Dependencies: none.
2. [F02 — Leaflet map and basemap switching](F02-map-and-basemaps.md) — done; live Mapbox operation confirmed by the user on 2026-10-28. Dependencies: F01.
3. [F03 — Address search through the local API](F03-address-search.md) — done. Dependencies: F01, F02; verified with OSM while F02's satellite-token check remains pending.
4. [F04 — Case domain model and JSON contract](F04-domain-and-json-contract.md) — done. Dependencies: F01.
5. [F05 — Case lifecycle, autosave, and file transfer](F05-case-persistence.md) — done. Dependencies: F02 implementation, F04; the user waived waiting for F02 live Mapbox acceptance.
6. [F06 — Animal profile and escape circumstances](F06-animal-profile.md) — done. Dependencies: F04, F05.
7. [F07 — Named map points and place roles](F07-map-points.md) — done; verified with OSM while F02 live Mapbox acceptance remains pending. Dependencies: F02, F03, F04, F05, F06.
8. [F08 — Point history and animal identification](F08-point-history.md) — done. Dependencies: F07.
9. [F09 — Search-area drawing and measurements](F09-search-areas.md) — in_progress; implementation verified, independent review pending. Dependencies: F07, F08.
10. [F10 — Actual searches and area-check history](F10-search-checks.md) — planned. Dependencies: F09.
11. [F11 — Persistent original-photo storage](F11-photo-storage.md) — planned. Dependencies: F01, F04, F10.
12. [F12 — Image processing and HEIC previews](F12-image-processing.md) — planned. Dependencies: F11.
13. [F13 — Photo attachments and viewing](F13-photo-interface.md) — planned. Dependencies: F06, F08, F10, F11, F12.
14. [F14 — Filters, point summaries, and interface refinement](F14-filters-and-interface.md) — planned. Dependencies: F13.
15. [F15 — Complete MVP acceptance and runbook](F15-mvp-acceptance.md) — planned. Dependencies: F14 and all earlier tasks complete.

This ordering implements the accepted stages: Docker/map, data/JSON, points/history, areas/checks, photos, filters/interface, then complete acceptance. Saving, restoration, and export are exercised as each feature lands, not postponed to F15.

## Shared boundaries

- Follow the agreed [frontend architecture](../architecture/frontend.md): `libs/web/**`, `libs/api/**`, and `libs/shared/case-domain`; one CaseStore composed from NgRx Events features, with one committed document and isolated drafts/candidates (ADR 0004); isolated Leaflet; strict Zod contracts; and revision-aware transactional persistence.
- The case lives in the browser with manual JSON transfer. The NestJS server owns assets and the search proxy; a shared photo server is not case synchronization.
- Use Nx + Angular + Leaflet + NestJS with Linux Docker. PostgreSQL/PostGIS are a later persistence direction. Current technical notes supersede the earlier Python/OpenLayers/GUGiK recommendations.
- Use OSM and the accepted Mapbox Static Tiles style. A Mapbox account/token is needed for the real satellite integration; obtain user-supplied credentials through private secret entry when necessary, never ordinary chat. A public client token is not an administrative secret. Keep local credential files out of version control.
- Retain the agreed MVP simplifications: predefined place roles, separate reports, history-based food context, no extra search-thoroughness fields, and no single-editor browser-tab lock.
- Use the accepted floating-panel prototype for visual direction; use current decisions for behavior, including three-way identification and visible different-animal sightings. The first delivery targets the desktop browser; phone-specific infrastructure and acceptance follow later.

## Specification coverage

- Case lifecycle and failure-safe saving: F04–F05; repeated through F15.
- Profile, optional values, and one canonical escape location: F04, F06–F07.
- Points, roles, four entry types, identification, and removal: F07–F08, F14.
- Basemaps, submitted address search, and provider failures: F02–F03, F15.
- Geometry, uncertainty, measurements, and actual search footprints: F04, F07–F10.
- Originals, derivatives, filenames, HEIC, retries, and photo UI: F11–F13.
- Context-preserving filters and derived counts: F14.
- Cross-feature acceptance, persistence, backups, and documented limitations: F15.

## Completion tracking

The index and each task file are the implementation tracker. Decision-ticket statuses remain `resolved` unless a genuine product change requires reopening a decision. A concrete implementation instruction such as “implement F01” authorizes that implementation task; the historical planning-only scope does not prevent carrying out a later explicit implementation request.
