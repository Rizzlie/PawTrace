# F05 — Case lifecycle, autosave, and file transfer

Status: planned
Depends on: F02, F04

## Goal

Make one case usable across browser reloads and manual JSON transfer, with failure-safe replacement and a truthful saved/unsaved status.

## Read first

- [Frontend architecture](../architecture/frontend.md), including library boundaries, editor ownership, and JSON/persistence flows.
- [Execution guide](README.md), [F02](F02-map-and-basemaps.md), and [F04](F04-domain-and-json-contract.md).
- [Case lifecycle](../mvp/issues/01-case-files.md) and [JSON contract](../mvp/issues/06-json-contract.md).

## Scope

1. Use one plain Angular signals service owning `AppState.document`, `ui`, `editor`, and `persistence`. Add creation, restoration, and automatic saving through an IndexedDB snapshot adapter using `idb`. Keep drafts outside the persisted document and distinguish the newest in-memory revision from the last successfully stored revision.
2. Provide new-case, export, and import actions. Export the complete case regardless of filters, with a version and export timestamp. Preserve all F04 fields, even before their UI exists.
3. Validate an imported document completely and offer warning, export, and cancellation before replacement. Store the candidate in one successful IndexedDB transaction before making it active. Failed replacement keeps the previous case active and stored; coordinate through the same writer as autosave. Do not merge cases.
4. On write failure, retain the latest in-memory data, preserve the last successful stored version, display a persistent unsaved indicator, and keep manual export available. Success status requires an actual successful write.
5. Connect map center, zoom, and basemap to `mapView`, with restoration that tolerates unavailable provider access. Keep view settings separate from domain facts.
6. Use one revision-aware writer: request a full snapshot on each confirmed document change, allow one in-flight transaction, and coalesce waiting work to the latest snapshot. Acknowledge the captured revision, not the revision current when completion fires. Retry failed autosaves on the next committed change or explicit retry; preserve a recoverable queue and avoid a continuous retry loop.

## Acceptance criteria

- A case and its view restore after refresh and reopening the browser.
- Export/import preserves a complete case fixture, including hidden/rejected entries and server-photo references.
- Malformed JSON, invalid relationships, and unsupported versions leave the current case and last stored version unchanged.
- Cancelling replacement keeps existing work; exporting first produces the latest in-memory state.
- Save failure never reports success or removes the ability to export. No cross-tab lock or automatic device synchronization is added.

## Validation

Test valid replacement, cancelled replacement, invalid import, reload restoration, and a forced storage failure followed by recovery. Compare the full data round-trip while accounting for expected export timestamps. Exercise these flows in the real browser, not only through a mocked state service.

## Architecture integration

Implement the state owner in `libs/web/workspace` and storage/file adapters in `libs/web/browser-persistence`. Follow the architecture replacement barrier, invalid-startup recovery, revision/session acknowledgement, and one-active-editor transitions. Export only committed data with visible draft exclusion; export does not change modification time, revision, or save acknowledgement. Test in-flight replacement and stale completions, not only successful sequential writes.

## Completion notes

To be filled during implementation.
