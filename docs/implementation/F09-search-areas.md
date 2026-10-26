# F09 — Search-area drawing and measurements

Status: planned
Depends on: F07, F08

## Goal

Draw and edit planned search areas as circles or polygons and provide meaningful distance, radius, and area measurements.

## Read first

- [Frontend architecture](../architecture/frontend.md), including library boundaries, editor ownership, and JSON/persistence flows.
- [Execution guide](README.md), [F04](F04-domain-and-json-contract.md), and [F07](F07-map-points.md).
- [Area semantics](../mvp/issues/03-map-records.md), [geometry contract](../mvp/issues/06-json-contract.md), and [map measurements](../mvp/issues/04-map-capabilities.md).
- [Free Leaflet editing and measurement options](../mvp/research/technical-feasibility.md), section 4. The obsolete OpenLayers/GUGiK recommendation is not the selected architecture.

## Scope

1. Integrate a free Leaflet geometry-editing route for circles and polygons. Keep geometry-library objects behind a map adapter rather than inside the shared case model.
2. Add creation, naming, selection, correction, and removal of planned search areas, with explicit confirm, undo-step, and cancel controls.
3. Keep working geometry separate from persisted state. Validate circles and polygon vertices before confirmation; ordinary panning does not edit shapes.
4. Store a circle's actual ground radius and center and a polygon's geographic vertices using F04 serialization. Preserve the geometry type across import/export.
5. Provide ground-distance measurement between selected positions, circle radius, and area measurement with explicit units. Avoid treating projected map coordinates as accurate ground distances.

## Acceptance criteria

- Both shapes can be drawn, adjusted, cancelled, saved, selected, and restored from JSON.
- Cancel/undo leaves previously saved geometry intact and no half-finished shape is autosaved.
- Circle radius and displayed measurements reflect ground units, not screen pixels or distorted projection units.
- Invalid/degenerate shapes produce readable feedback rather than invalid exports.
- Removing a plan later must not erase historical actual-search geometry introduced in F10; define the data boundary accordingly.

## Validation

Exercise circle and polygon creation/correction/undo/cancel in the browser. Verify round-trips, a known approximate distance/area reference, invalid geometry, and repeated editing without coordinate-order swaps. Record the selected free editor and its actual supported version.

## Architecture integration

Keep geometry drafts in the active editor and temporary Leaflet layers in map-engine. Save publishes geometry; Cancel restores committed data without paid plugin cancellation APIs. Preserve circle center/radius and clean up session modes/listeners.

## Completion notes

To be filled during implementation.
