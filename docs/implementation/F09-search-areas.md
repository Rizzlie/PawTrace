# F09 — Search-area drawing and measurements

Status: done — standards and spec reviews completed; review fix verified (merged in #12)
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

Implemented circle and polygon plans with naming, descriptions, selection from the map or shared place list, explicit Save/Cancel, geometry undo, draggable handles and coordinate correction through Signal Forms. Circle centers and ground radii remain circles in JSON; polygon vertices retain geographic latitude/longitude. Invalid or degenerate geometry is rejected before commitment. Drawing and measurement icons share the existing vertical map-actions toolbar with My Location and Add Point, with Angular Aria keyboard navigation and Material tooltips.

The selected free editing route is the existing MIT-licensed Leaflet **1.9.4**, using native circles, polygons and draggable markers in the focused `LeafletAreas` adapter. No paid editing extension is required. The adapter receives plain committed scenes and session-scoped drafts, reconciles saved shapes by stable IDs, emits technical geometry intents, and removes handles/listeners when editing ends. The CaseStore owns the single area draft, undo history, validation and atomic commitment; unrelated viewport updates do not publish geometry. Dirty editor transitions retain Save / Discard / Stay and cancel pending Saves. Invalid coordinate-form values stay in the draft and are not passed to Leaflet.

`@turf/distance` and `@turf/area` **7.4.0** provide great-circle distance in meters and polygon ground area in square meters. Circle area uses πr² from its ground radius. These are approximate ground measurements, not survey-grade or walking-route calculations. The lightweight `case-domain/geometry` entry point keeps measurements independent of framework/Leaflet objects and lazy document validation. A transient two-position measurement mode supports draggable endpoints, undo and completion without becoming case data.

Removing a plan with checks clears only `plannedGeometry`, retaining the area ID, metadata and complete actual-search snapshots. A plan without checks can be removed entirely. Editing a plan never rewrites historical check geometry; F10 will add check editing.

TDD at the user-confirmed seams observed missing measurement functions, missing CaseStore area commands and missing map geometry intents before implementation. Regression coverage includes draft isolation, undo, invalid polygons, dirty transitions, cancellation of delayed Saves, stale form/geometry events and retention of historical footprints. Browser scenarios cover both shapes, dragging, cancellation, validation, persistence, JSON transfer, removal, measurements and the shared toolbar at desktop/390px widths.

References checked: [Leaflet 1.9.4](https://leafletjs.com/reference.html), [Turf area](https://turfjs.org/docs/api/area), [Turf distance](https://turfjs.org/docs/api/distance).

Verification on 2026-10-28:

- `npm exec nx run-many -- -t typecheck lint test build --output-style=static` exercised all 24 targets across eight projects. All 235 unit/integration tests passed (122 case-domain, 46 workspace, 33 map-engine, 31 API, two browser-persistence and one web). The first run exposed an unused-expression lint error in the measurement-session reset; replacing it with the declarative `linkedSignal` source/computation form fixed it. `npm exec nx run-many -- -t typecheck lint build -p web --output-style=static` passed after the correction.
- `npm exec nx run web-e2e:e2e -- --workers=4 --output-style=static` passed all 63 Chromium scenarios. The first full run passed 62/63: an older restored-case geolocation assertion counted every SVG path, including the newly rendered imported areas. It now counts the two named location layers and retains the viewport/timestamp assertions. The complete rerun passed without increasing timeouts or bypassing assertions.
- Desktop and 390px screenshots were inspected. The toolbar stays visible, geometry handles are separate from saved shapes, and panels scroll without shrinking the map canvas. A phone test initially clicked a location-denial overlay; using exposed map positions and initializing the phone viewport before restoration corrected the scenario. Keyboard coverage enters the toolbar through its first widget and follows ArrowDown through the new actions.
- `git diff --check` passed. Tests use controlled tiles; no external provider quota, paid editor, asset operation or schema-version change was introduced.

### Standards review

Independent review against user-confirmed base `492cde6` found no documented-standard violations. One low-priority possible duplication judgment notes the feature-owned Save cancellation/validation/commit sequence shared in shape with existing editors. It remains a future deepening opportunity; no speculative editor abstraction was added.

### Spec review

Independent review against the same base found one medium-severity cleanup defect: removing listeners before a saved shape prevented Leaflet's own bound-tooltip cleanup. All three saved-plan removal paths now remove the layer before clearing its listeners. A browser regression leaves the pointer over a plan, opens editing by keyboard and asserts that the open label is removed; it failed with one orphaned tooltip before the correction. No other missing requirements, incorrect behavior or scope creep was identified. After correction, all 12 selected frontend typecheck/lint/test/build targets passed, and the complete 63-scenario browser suite passed with `npm exec nx run web-e2e:e2e -- --workers=2 --output-style=static`. An earlier four-worker post-review run passed all F09 scenarios but hit an application-start timeout in an existing profile scenario and a pre-collapse layout read in an existing point-panel scenario. The collapse helper now explicitly waits for the list to be hidden before measuring layout; no timeout or product assertion was relaxed.
