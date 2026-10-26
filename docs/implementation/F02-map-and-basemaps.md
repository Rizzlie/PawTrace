# F02 — Leaflet map and basemap switching

Status: planned
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

To be filled during implementation.
