# F02 — Leaflet map and basemap switching

Status: blocked — implementation ready; live Mapbox verification pending a configured public token
Depends on: F01

## Goal

Replace the empty shell with a real Leaflet map that dominates the workspace and switches between basic OSM mapping and the accepted Mapbox satellite style.

## Read first

- [Frontend architecture](../architecture/frontend.md), including library boundaries, editor ownership, and JSON/persistence flows.
- [Execution guide](README.md) and [F01](F01-workspace-and-docker.md).
- [Map capabilities](../mvp/issues/04-map-capabilities.md).
- [Mapbox provider decision](../mvp/issues/12-satellite-provider.md).
- [Interface decision](../mvp/issues/05-map-workflow.md) and [visual reference](../mvp/prototypes/pawtrace-floating-prototype.html).

## Scope

1. Integrate Leaflet with the Angular lifecycle, container sizing, cleanup, and desktop shell. Keep the map independent of future domain-model persistence.
2. Configure OSM street tiles and Mapbox `satellite-streets-v12` through Static Tiles API. Verify current provider documentation, tile size/zoom behavior, and attribution. Preserve both selectable basemaps.
3. Expose provider settings through application configuration. Handle missing credentials, denied requests, quota exhaustion, and tile failures with readable state and a usable basic map.
4. Keep attribution visible with floating controls. Set the initial view to an appropriate Poland-focused extent; actual case-specific view restoration arrives in F05.
5. Provide the location-on-demand action with denial/unavailable handling and manual map navigation. Phone access and certificate installation are not acceptance prerequisites.

## Acceptance criteria

- The map fills the workspace without permanent layout columns reducing its size.
- Both real basemaps render and can be switched without losing the current map center/zoom.
- Source attribution remains readable. Requests comply with the accepted provider policies.
- Missing or failing satellite access leaves OSM and ordinary map interactions usable; credentials are not hardcoded into committed source.
- Location denial is visible and does not break navigation. No continuous tracking is introduced.

## Validation

Exercise both basemaps with a configured account and inspect representative actual tile responses. Use controlled failures for missing/invalid credentials and source errors. Keep external requests small. If a token is unavailable, complete independent work and record the exact satellite check still blocked; do not claim both layers were verified.

## Architecture integration

Implement the map host inside `libs/web/map-engine`. Consume plain scene/view/draft inputs and emit intents; do not inject the application store. Reconcile layers by stable IDs, suppress restoration feedback, and dispose listeners/layers on destruction.

## Completion notes

Implemented on 2026-10-26 on `feat/f02-map`. The map fills the desktop workspace, starts over Poland, supports keyboard/mouse navigation, and switches OSM and Mapbox `satellite-streets-v12` through Static Tiles API without recreating the map or changing its viewport. Mapbox uses 512-pixel tiles with zoom offset -1. Floating controls preserve visible attribution; satellite mode includes Mapbox/OSM/Maxar links, feedback and the official Mapbox logo.

`libs/web/map-engine` owns Leaflet, ResizeObserver, listeners, the active basemap, tile timeout, and temporary device-location layers. `LeafletMap` is an Angular service provided by each `MapEngine` host; hosts have independent instances and Angular releases resources via `ngOnDestroy`. Its public inputs/outputs are plain configuration and viewport values. Programmatic viewport restoration and resize do not emit user edits; completed navigation does. The component ignores geolocation callbacks after destruction. Stable-ID domain-layer reconciliation and geometry drafts belong to F07/F09; F02 creates no case state or persistence.

Runtime configuration comes from `GET /api/map-config` with `Cache-Control: no-store`. Compose passes `MAPBOX_PUBLIC_TOKEN`; Node development uses the terminal environment. Only `pk.*` browser tokens are returned, never `sk.*` secrets. Missing/failed configuration leaves OSM usable, with explicit configuration retry. Missing tokens, tile errors and a 15-second satellite timeout retain/restore OSM and explain recovery. Browser image errors do not reveal HTTP status, so the message does not pretend to distinguish access denial, quota exhaustion and network failure. OSM errors offer manual retry. No automatic paid upgrade, continuous tracking, prefetch or offline download was added.

Review corrections on 2026-10-26: viewport restoration now coalesces the latest request and waits for queued/in-flight animated zoom to finish, suppressing edit intents until the requested view is applied. Regression tests first failed on both animation cases, then passed after the fix, including resize during pending restoration and cancellation during service destruction. Destruction during an active zoom also has a regression test: final map removal waits for Leaflet's zoom completion, preventing its timer from accessing a deleted pane. Source URLs and matching HTML attribution are configurable through `OSM_TILE_URL`/`OSM_ATTRIBUTION` and `SATELLITE_TILE_URL`/`SATELLITE_ATTRIBUTION`; defaults remain OSM and the accepted Mapbox style. The API forwards these pairs, the frontend validates them, and the service sanitizes attribution. Compatible replacement sources use 256-pixel basic tiles or 512-pixel satellite tiles with offset -1. The component displays the Mapbox logo for the Mapbox endpoint.

Verification:

- `npm exec nx run-many -- -t typecheck lint test build -p web api web-e2e map-engine`: all 13 tasks passed; 28 unit/integration tests passed, including animation and service-lifecycle regressions. Root check scripts now include the map library.
- With `BASE_URL=http://127.0.0.1:4200`, `npm exec nx run web-e2e:e2e -- --output-style=static`: all 13 Chromium tests passed. Controlled responses exercise full-workspace sizing, keyboard navigation, layer switching, viewport preservation, logo/attribution, missing credentials, HTTP 401/403/429/503 fallback, OSM retry, configuration recovery, custom source/attribution pairs, invalid source configuration, location denial and successful location/accuracy display. Map tests assert no browser exceptions and do not consume external tile quotas.
- The first browser run caught incorrect layer cleanup: calling `off()` before `remove()` suppressed Leaflet's own removal listeners, leaving attribution and stale zoom handlers. Reversing the order fixed it; the regression test switches back to OSM, checks attribution removal, and navigates again.
- Collaborative browser inspection against the real development app loaded 24 visible OSM tiles (HTTP 200, 256 pixels each), with no browser errors. At 1280×800 the map filled its 1254×693 workspace; provider attribution remained visible.
- `docker compose config --quiet` and `docker compose up --build --wait`: passed. Clean Linux dependency installation and both production builds succeeded; the container is healthy at `http://127.0.0.1:8080`, health is `ok`, and runtime configuration correctly reports no configured Mapbox browser token. With `BASE_URL=http://127.0.0.1:8080`, the same Nx e2e target passed all 13 tests against the production container.

Provider documentation checked: [Leaflet reference](https://leafletjs.com/reference.html), [Mapbox Static Tiles](https://docs.mapbox.com/api/maps/static-tiles/), [Mapbox trial limits](https://docs.mapbox.com/accounts/guides/signup/), [Mapbox attribution](https://docs.mapbox.com/help/ja/dive-deeper/attribution/), and [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/). Direct browser requests preserve normal HTTP caching and Referer. No Mapbox account or payment method was created and no token was obtained.

Remaining acceptance blocker: configure an accepted card-free Mapbox account's public token, inspect a small number of actual satellite tile responses and confirm real imagery, labels, alignment and attribution while switching both layers at the same center/zoom. Controlled tile tests establish integration and failure handling, not provider-account access or real satellite imagery. F02 remains blocked until this check is completed.
