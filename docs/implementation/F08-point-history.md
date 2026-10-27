# F08 — Point history and animal identification

Status: in_progress
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

TDD observed failures for missing chronology, history editing, marker outcomes and dirty selection before their implementation. Focused regressions pass. Final acceptance and independent Standards/Spec review are in progress; completion status will be updated with their results.
