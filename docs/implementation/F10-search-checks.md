# F10 — Actual searches and area-check history

Status: done
Depends on: F09

## Goal

Record actual searches separately from plans, retaining each check's time, result, notes, and real footprint even when a plan changes later.

## Read first

- [Frontend architecture](../architecture/frontend.md), including library boundaries, editor ownership, and JSON/persistence flows.
- [Execution guide](README.md), [F08](F08-point-history.md), and [F09](F09-search-areas.md).
- [Area and check semantics](../mvp/issues/03-map-records.md).
- [Historical geometry and references](../mvp/issues/06-json-contract.md).
- [Refinement scope reductions](../mvp/issues/13-plan-refinement.md).

## Scope

1. Add a history of actual checks for planned areas, plus a path to record a search without a prior plan.
2. Let a check retain the whole planned footprint or a separately marked searched portion. Snapshot actual geometry so later plan edits do not rewrite the past.
3. Implement the agreed result categories, precise/uncertain time, notes about the process, and existing photo-reference fields. Keep hiding-place checks in their point history using compatible result semantics.
4. When a result involves seeing the animal, reference a single observation entry rather than duplicating it across histories. Keep optional relationships valid when referenced records are removed or a plan is deleted.
5. Show repeated searches independently. Recording no sighting does not permanently exclude the area; recording recovery does not lock the case.

## Acceptance criteria

- One area can have multiple checks with different times, results, and actual footprints.
- Partial and unplanned searches can be recorded and restored.
- Changing/removing a plan does not discard historical actual-search geometry.
- The agreed results work consistently for point and area checks; observation references remain valid without duplicate observations.
- The forms retain the existing free-text process note without introducing the rejected extra search-thoroughness fields.

## Validation

Record two checks of one plan, one partial search, and one unplanned search. Edit and remove a plan and verify historical records. Exercise a linked observation and its later removal while keeping the case valid. Verify these scenarios survive reload and JSON transfer.

## Architecture integration

Area-check editors use the shared explicit Save/Cancel lifecycle. Preserve actual historical geometry independently of later plan edits; publish a complete domain change through the root owner.

## Completion notes

Implemented actual-search creation and editing in the existing CaseStore and explicit Save/Cancel lifecycle. A new check can snapshot the whole current plan or use a separate circle/polygon footprint; searches without plans create an area with no planned geometry. Existing checks reopen their historical footprint rather than the current plan. Plan edits/removal preserve all check snapshots, identifiers, photo references and times.

Signal Forms edit the single session-owned draft. Derived history sections and map scenes use computed projections. Form and map geometry changes share undo history, and session IDs/cancellation protect against stale edits and delayed Saves. The shared event-time editor handles exact, approximate, range, date-only and unknown times, including explicit repeated-hour choices. Point and area controls share result labels and reference existing observation entries; removing an observation uses the existing unlink rule, retaining the search and an explanatory note. Recovery never locks the case.

Actual footprints render as separate dashed purple layers, selectable through the same area's history. Areas without plans remain accessible in the place list. Process notes remain free text; no new thoroughness fields, observation copies, photo-upload workflow or JSON version were introduced.

Verification on 2026-10-28:

- `npm exec nx run-many -- -t typecheck lint test build --output-style=static` passed all 24 targets across eight projects. All 239 unit/integration tests passed (123 case-domain, 49 workspace, 33 map-engine, 31 API, two browser-persistence and one web).
- With the existing local development services, `$env:BASE_URL='http://127.0.0.1:4200'; npm exec nx run web-e2e:e2e -- --workers=2 --output-style=static` passed all 66 Chromium scenarios. F10 scenarios cover two searches of one plan, a smaller footprint, plan editing/removal, unplanned polygon creation at 390px, cancellation/Stay, recovery, linked-observation validation/removal, reload and JSON transfer. Existing history scenarios also verify the shared time controls, including repeated hours.
- TDD observed missing check commands, missing shared area chronology and absent historical map layers before implementation. An added undo regression exposed a form-radius change skipping geometry history; form and map edits now use the same immutable session update. Stale writes, delayed Saves, invalid geometry/references and retained photo/time metadata are covered through the agreed public seams.
- Initial browser runs corrected test integration details: JSON fixture import is static, select locators use the combobox role, and a subsequent import waits for the prior confirmation dialog to close. No product assertion or timeout was relaxed. The first automatic-service run found ports already occupied, so subsequent runs used the documented BASE_URL option with the running workspace services.
- Desktop and 390px screenshots were inspected. Panels scroll, controls remain usable and the map retains room for geometry editing. Tests use controlled map responses; no paid provider or photo operation was introduced.

## Standards

Independent review against user-approved `main` (pinned `8f9dd76b0348d2a162913003a6104ae633dfe05a`, including uncommitted/new files) found three low-priority items:

- The shared export warning and Save/Discard/Stay dialog mislabeled actual-search drafts as profiles. A single computed label now covers every editor kind, and the phone regression checks the actual-search dialog title.
- Possible duplicated observation-option projections in point and area histories. Both now use the existing history-presentation module's shared projection.
- The case-domain README documented the old history-ordering export. It now documents `chronologicalHistory` for point entries and area checks.

Standards: three findings, worst severity low; all addressed before final validation.

## Spec

The independent spec review found one low-priority issue: the same misleading actual-search draft label in shared lifecycle feedback. The computed label and browser assertion resolve it. No other missing requirements, scope creep or incorrect F10 behavior was identified.

Spec: one finding, worst severity low; addressed before final validation.

## Material UI follow-up

Migrated forms, buttons, menus, badges, cards, lists and dialogs to the installed Angular Material/CDK 22.2.3 packages. The shared Material 3 theme retains the PawTrace palette and typography. Place and area lists scroll independently beneath fixed headings, with rounded items and visible selection/focus indicators. Search and place panels share a width; details reserve room for map controls.

Final affected checks against `main` passed lint, typecheck, build and 209 unit/integration tests across seven projects. Formatting passed, and all 71 Chromium scenarios passed using an isolated development server on port 4300. Added regression coverage verifies that an unavailable satellite selection retains OSM, explicitly choosing the active OSM fallback persists that choice, the search field remains visible, and list scrolling leaves headings fixed. Dialog cancellation/focus restoration and JSON round-trips remain covered.
