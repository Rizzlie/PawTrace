# F08 — Point history and animal identification

Status: done
Depends on: F07

## Goal

Turn each named place into an editable chronological history with observations, actions, checks, notes, and per-observation animal identification.

## Read first

- [Frontend architecture](../architecture/frontend.md), including library boundaries, editor ownership, and JSON/persistence flows.
- [Execution guide](README.md), [F04](F04-domain-and-json-contract.md), and [F07](F07-map-points.md).
- [Current history and identification rules](../mvp/issues/03-map-records.md).
- [Interface rules](../mvp/issues/05-map-workflow.md) and [refinement decisions](../mvp/issues/13-plan-refinement.md).

## Scope

1. Add type-specific entry forms and edit/remove actions for observation, action, check, and note. Preserve stable entry IDs, automatic creation/update times, optional event time, description, and photo-reference fields.
2. Implement observation source, source description, location uncertainty, and the three identification outcomes: target animal, different animal, uncertain. Manual rejection and its reason remain separate from identification.
3. Implement the agreed optional structured action/check details, such as food type/quantity and food present/partly eaten/absent. Keep repeated reports separate and food context readable through history without extra relationship workflows.
4. Show newest-first history with explicit time precision, a distinct unknown-time section, and deterministic ordering for ties and uncertain times using the F04 model. Retain the original time description.
5. Add per-outcome observation counts and distinguishable map presentations. Different-animal sightings remain visible. Initial counts cover the unfiltered history; F14 connects them to active filters using the same derived calculation.
6. Keep recovery as a check result while leaving the case editable. Photo upload/viewing is added in F13; existing filename references must survive all edits meanwhile.

## Acceptance criteria

- One point can contain the full example sequence: sighting, food placement, food still present, food gone.
- Each observation retains its own source and identification, including mixed outcomes at one point.
- Different-animal identification neither hides the record by default nor automatically marks it manually rejected.
- Unknown/approximate/range/date-only times are editable without invented precision.
- Counts recompute after edits/removals and remain derived. A recovered case stays editable and exportable.

## Validation

Test entry-type validation, chronological/unknown-time ordering, identification transitions, manual rejection independently, and count changes. Exercise the sequence in the browser, then reload and export/import it. Confirm no duplicate-report grouping, food-event linking, or custom place-role editor was introduced.

## Architecture integration

Use the same one-owner Signal Forms draft lifecycle for history entries. Preserve complete contextual point history; do not introduce another feature store or mutate committed entry references from controls.

## Completion notes

Implemented four entry forms and edit/removal commands in the existing CaseStore, using its one-owner Signal Forms draft and shared Save / Discard / Stay lifecycle. Entry IDs, type, creation time and photo references survive edits. Identification and reasoned manual rejection remain independent. Food details, check results, linked observations and recovery use the existing JSON contract; recovery leaves the case editable.

Pure history projections provide deterministic newest-first ordering in the case zone, separate unknown-time entries and derived per-outcome counts. Different-animal and mixed sightings stay visible through marker accent rings and accessible summaries. F08 uses complete-history counts; F14 owns active filters. No food-action links, report grouping or custom roles were added.

Profile/history drafts share time conversion, including explicit repeated-hour choices, nonexistent-hour validation and preservation of imported offsets/precision. A lightweight `case-domain/history` entry point keeps these projections separate from lazy Zod validation. All editors share session IDs; selection from markers/list, profile routing and case transfer resolve dirty history first.

TDD observed failures for missing chronology, history editing, marker outcomes and dirty selection before their implementation. Regression coverage includes all entry types, invalid rejection/quantity/link data, delayed-Save cancellation, stale field writes, outcome-count changes, preservation of all imported time variants and photo references, and deletion reference repair.

Validation:

- `npm exec nx run-many -- -t typecheck lint test build e2e --output-style=static` exercised all 25 targets. Typechecking, lint and both builds passed; the first run lacked the Redis and web services after a session interruption. Redis was started with the documented Compose command, and `npm exec nx run api:test -- --output-style=static` passed all 31 API tests. Combined unit/integration coverage passes 230 tests, including 120 case-domain, 44 workspace and 32 map-engine tests.
- `npm exec nx run web-e2e:e2e -- --workers=4 --output-style=static` passed all 60 Chromium scenarios, including four new history scenarios. They exercise sighting/food placement/present/absent, reload, JSON transfer, mixed/different-animal outcomes, dirty transitions, deletion, repeated DST hours, reasoned rejection and editable recovery at 1280px/390px.
- The first service-managed browser run passed 58/60: a new mobile helper checked the collapse toggle before the restored view rendered; waiting for the save status and toggle fixed synchronization. An existing persistent-browser scenario also timed out under eight-worker load; the complete four-worker run passed. No timeout was increased or assertion bypassed.
- Screenshots at 1280px/390px were inspected. Save/Cancel returns focus and scroll to the place heading, keeping identity and counts visible. Map canvas dimensions stay unchanged; phone places remain collapsed initially.
- Following the review's shared-unlink refinement, case-domain/workspace typechecking, lint and all 164 tests passed again; targeted browser coverage repeats both removal paths and the four new history scenarios.

The live F02 Mapbox acceptance remains separately blocked. Tests use controlled map responses; no paid service or server photo operation was used.

### Standards review

Independent review against user-confirmed `478529b` found no documented-standard violations and two low-priority duplication judgments. Entry/point deletion now shares the domain unlink operation, including metadata updates. The existing feature-owned Save protocol remains a nonblocking deepening opportunity; no speculative editor framework was introduced.

### Spec review

Independent review against the same base found no missing/partial requirements, scope creep or incorrect F08 behavior. Active filters and photo upload/viewing remain in F14/F13 respectively.
