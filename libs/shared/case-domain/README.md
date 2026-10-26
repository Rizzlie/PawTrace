# Case domain

Framework-neutral JSON v1 contracts for one PawTrace case, imported from `@pawtrace/case-domain`. Zod schemas are the source of TypeScript types. Runtime code imports no Angular, Leaflet, NestJS, filesystem, or storage APIs; typechecking uses ES2022 with no browser or Node ambient types.

## Public interface

- `validateCaseDocument(value: unknown)` validates a local committed snapshot.
- `parseCaseFile(text: string)` validates JSON syntax, strict file structure and domain invariants, then returns a committed document without file-only `exportedAt`.
- Both return `{ success: true, data }` or `{ success: false, issues }`. Each issue has a field `path`, `code` and readable `message`; broken references and duplicate IDs name the offending value. Validation never writes state or storage and never checks remote photo availability.
- `serializeCaseFile(document, exportedAt)` validates the committed snapshot and supplied timestamp, then returns indented Unicode JSON. Invalid input throws a Zod error before producing a file. No case timestamp, revision, or save acknowledgement is changed.
- Document/file, profile/history/time/geometry schemas and inferred types support later form and adapter integration. Use full-document validation before accepting a snapshot: component schemas cannot check references to other records.

The [v1 field reference](../../../docs/architecture/case-json-v1.md) records the concrete vocabulary. The [complete fixture](src/fixtures/complete-case-v1.json) includes future UI fields, all history/time/identification variants, rejection, independent search footprints, original/derivative metadata, and an unavailable photo. The [minimal fixture](src/fixtures/minimal-case-v1.json) has no profile, points, areas or assets.

## Verification

```sh
npx nx run case-domain:test --run src/lib/case-contract.spec.ts
npx nx run case-domain:typecheck
npx nx run case-domain:lint
```
