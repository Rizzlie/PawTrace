# F04 — Case domain model and JSON contract

Status: planned
Depends on: F01

## Goal

Implement the complete version-1 case model and runtime JSON validation in framework-neutral shared TypeScript code, ready for incremental UI features without losing future fields on import/export.

## Read first

- [Frontend architecture](../architecture/frontend.md), including library boundaries, editor ownership, and JSON/persistence flows.
- [Execution guide](README.md) and [F01](F01-workspace-and-docker.md).
- [JSON contract](../mvp/issues/06-json-contract.md), using the current `Answer` including refinement changes.
- [Map semantics](../mvp/issues/03-map-records.md), [profile scope](../mvp/issues/02-animal-profile.md), and [glossary](../../GLOSSARY.md).

## Scope

1. Define case metadata, the optional animal profile, escape circumstances, named points, predefined roles, four history-entry types, areas/checks, asset metadata, and map-view state. Keep one canonical escape-point reference.
2. Encode the three identification outcomes independently from manual rejection. Model structured action/check details without adding food-event links or same-event grouping. Use stable IDs and explicit units and geographic coordinate names.
3. Implement exact/approximate/range/date-only/unknown event-time representations with original descriptions and time-zone context. Preserve `null`, explicit negative answers, and empty lists as distinct meanings.
4. Define the shared runtime contract with Zod and infer TypeScript types from it. Reject unknown fields explicitly at every relevant object level instead of relying on permissive parser defaults. Add readable errors for version, field types, duplicate IDs, invalid geometry, and inconsistent references. Missing server images are not schema errors. Keep circular areas as center/radius and preserve actual historical footprints separately from plans.
5. Add serialization and representative fixtures covering the full model, including features whose forms will arrive later. Document the concrete v1 field/enumeration choices alongside the implementation.

## Acceptance criteria

- A complete case round-trips without losing identities, unknown values, assessments, event-time precision, geometry, or filename references.
- Invalid documents fail with actionable errors before any state replacement.
- Supported-version files with unknown root or nested fields fail explicitly without silently dropping data.
- Different-animal observations are valid retained data, not automatically rejected entries.
- Filter-dependent counts are derived rather than stored as competing facts.
- Browser and server code can consume the shared contracts without importing framework or filesystem dependencies into the model.

## Validation

Use meaningful schema/round-trip tests for a complete case, all time variants, all identification outcomes, duplicate/broken IDs, invalid circles/polygons, and an unsupported version. Include an unavailable-photo reference that remains valid. Test a representative exported JSON fixture against the actual runtime validator.

## Architecture integration

Place the shared contract in `libs/shared/case-domain`. Share strict base schemas between local documents and exported files; generate file-only `exportedAt` without retaining competing case models. Parser/validator functions perform no state or storage writes.

## Completion notes

To be filled during implementation.
