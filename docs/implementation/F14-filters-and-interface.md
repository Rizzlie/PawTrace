# F14 — Filters, point summaries, and interface refinement

Status: planned
Depends on: F13

## Goal

Complete the desktop workspace with context-preserving filters, accurate per-outcome point counts, and the accepted polished green floating-panel layout across the integrated features.

## Read first

- [Frontend architecture](../architecture/frontend.md), including library boundaries, editor ownership, and JSON/persistence flows.
- [Execution guide](README.md), [F08](F08-point-history.md), and [F13](F13-photo-interface.md).
- [Current interface rules](../mvp/issues/05-map-workflow.md), [refinement outcome](../mvp/issues/13-plan-refinement.md), and [visual reference](../mvp/prototypes/pawtrace-floating-prototype.html).
- [Identification glossary](../../GLOSSARY.md) and [readiness cases](../mvp/issues/11-mvp-readiness.md).

## Scope

1. Implement filters for predefined point roles, entry types, event time, and manual rejection, with the agreed unknown-time option. Keep filter state separate from exported case facts.
2. Apply filters consistently to the map/list and observation-count derivation. Overlapping time ranges and uncertain dates follow the F04 time representation; communicate precision without invented event timestamps.
3. Keep the selected point's full contextual history when opened and highlight matching entries. Manually rejected reports retain their show/hide control; different-animal identification remains independently visible.
4. Show confirmed/uncertain/different-animal counts and distinguish identification outcomes through readable labels and visual cues. A place with mixed outcomes does not receive one editable point-level identification.
5. Refine floating collapsible panels, form placement, overlapping-object selection, empty/no-result states, keyboard focus, control labels, and destructive-action confirmations. Keep the map canvas available behind panels.
6. Ensure filter/reset workflows do not modify persisted records, omit data from export, or imply that old evidence belongs to a recent time window.

## Acceptance criteria

- A point with old confirmed and recent uncertain/different-animal sightings has correct counts for each selected period.
- Different-animal sightings remain available on the map and in summaries rather than being silently hidden as rejected.
- Selecting a matching point retains earlier contextual actions in its full history, with matches highlighted.
- Unknown-time entries, points without history, no-result views, and overlapping points have usable behavior.
- Profiles, histories, areas, and photos share the accepted visual direction without static sidebars shrinking the map.
- Export is complete under every tested filter combination.

## Validation

Use a multi-point fixture with mixed assessments, rejected records, uncertain/range/unknown times, empty histories, and photos. Check filter combinations, resetting, derived counts, full-history context, and export equality. Inspect the integrated desktop workspace and keyboard interactions; retain a usable narrow layout without adding phone acceptance or HTTPS work.

## Architecture integration

Derive filters, counts, and scene projections from the single state; keep UI-only fields out of storage/export. Unrelated UI updates must not reset active drafts or reconstruct all Leaflet layers.

## Completion notes

To be filled during implementation.
