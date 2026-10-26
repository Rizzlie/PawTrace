# F04 — Case domain model and JSON contract

Status: done
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

Implemented and verified on 2026-10-26. `libs/shared/case-domain` exposes the framework-neutral `@pawtrace/case-domain` contract, Zod-inferred types, full-document validation, pure file parsing and serialization. It covers the profile, canonical escape reference, all four history types, independent identification/rejection, event-time precision, planned/actual geometry, photos/assets and map view. All objects reject unknown fields. Invalid references, duplicate IDs/filenames, inconsistent photo selections, malformed times and invalid geometry fail with paths and readable errors. Missing image files or asset metadata remain valid.

The [v1 field reference](../architecture/case-json-v1.md) documents concrete fields and enums. Checked-in minimal and complete exported JSON fixtures are validated by the real public parser; the complete example retains all future feature fields and unavailable-photo references. Parsing consumes file-only `exportedAt`; export accepts a fresh timestamp without changing the committed document. State, IndexedDB and file-interface integration remain in F05.

Validation:

- Successive TDD cycles observed failures before implementing complete-case support, duplicate-ID/reference checks, rejection/photo rules, interval/time-zone checks and polygon invariants.
- `npx nx run case-domain:test --run src/lib/case-contract.spec.ts --output-style=static`: 117 tests passed, including unknown-field injection at every object in the complete fixture.
- `npx nx run-many -t typecheck lint test build e2e --output-style=static`: all typechecks, lint tasks, 175 unit/integration tests and both application builds passed. E2E startup encountered the already-running development API on port 3000; no existing server was stopped.
- `$env:BASE_URL='http://127.0.0.1:4200'; npx nx run web-e2e:e2e --output-style=static`: all 19 Chromium tests passed against the running development application. `BASE_URL` was removed afterwards.
- `npx nx format:check --uncommitted` and `git diff --check`: passed.
- Runtime library typechecking uses ES2022 with `types: []`, verifying no browser/Node ambient dependency. Existing module-boundary rules enforce the shared-only dependency direction.

The unchanged frontend build reports its existing 529.91 kB initial bundle warning; existing map e2e tests have four non-null-assertion lint warnings. Neither is an F04 failure. F02's live Mapbox token acceptance remains separately tracked.

### Standards review

Independent read-only review against task-start commit `306e0a63582882ff65da81d5d352fb6f458ef6d3`: no actionable documented-standard violations or baseline code smells.

### Spec review

Independent read-only review against the same fixed point: no actionable missing, incorrect or out-of-scope F04 behavior.
