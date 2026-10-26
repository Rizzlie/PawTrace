# F10 — Actual searches and area-check history

Status: planned
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

To be filled during implementation.
