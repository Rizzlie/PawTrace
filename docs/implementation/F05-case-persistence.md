# F05 — Case lifecycle, autosave, and file transfer

Status: done
Depends on: F02 implementation, F04. The user explicitly authorized F05 without waiting for F02's live Mapbox acceptance on 2026-10-27; F02 remains independently blocked.

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

Implemented on `feat/f05-case-persistence` on 2026-10-27. One private signals root in `AppState` owns the committed document, transient replacement UI, reserved editor slot, and persistence revisions/session generation. F06 and later tasks will add their explicit-confirmation form/geometry editors; F05 does not add those editors.

`BrowserSnapshot` uses `idb` to store one full document transactionally. `SnapshotWriter` allows one in-flight write, coalesces pending updates, acknowledges captured revisions, stops draining on failure and retries on explicit request or the next committed change. Confirmed replacement blocks mutations, drains the active transaction, supersedes old pending snapshots, persists the candidate and only then activates a fresh session. Failed replacement preserves the old case, its latest in-memory changes and its last successful snapshot.

`CaseControls` exposes creation, import, complete export, replacement summary/export/cancellation, storage retry and invalid-startup recovery. Validation errors include contract paths. Unreadable or invalid browser data is not overwritten automatically. File-only export metadata never changes document timestamps or revision acknowledgements. Future/unexposed fields and unavailable server-photo references survive complete round trips.

Map center, zoom and requested basemap share the writer, without modifying case factual timestamps. Restoration suppresses map edit intents; provider fallback retains the saved satellite preference and leaves OSM usable. Explicit OSM selection changes the stored preference even when OSM was already the fallback. The contract is asynchronously loaded outside the initial map bundle.

Validation:

- `npm exec nx run-many -- -t typecheck lint test build e2e`: all tasks except `map-engine:test` passed on the first full-workspace run, including 25 browser scenarios. Four map assertions caught normalization changing an already-valid longitude's floating-point representation. Normalization now runs only outside the accepted longitude range; all 25 map unit tests then passed.
- With `BASE_URL=http://127.0.0.1:4200`, `npm exec nx run-many -- -t typecheck lint test build e2e -p workspace browser-persistence map-engine web web-e2e --output-style=static`: all 18 selected/dependency tasks passed after corrections, including 14 AppState tests, 2 IndexedDB adapter tests and all 26 Chromium scenarios (7 for F05).
- Browser acceptance aborts actual IndexedDB transactions, exercises failed replacement and explicit recovery, rejects malformed/unsupported files, preserves invalid startup data, compares complete fixture round trips including photo references, and closes/relaunches Chromium with the same persistent profile. Rendered tile coordinates are compared across reopening to verify actual viewport restoration. Tests use controlled provider responses, without consuming Mapbox quotas.
- The review regression for selecting satellite before case creation failed before the state-ownership correction and passed afterwards. Both the empty workspace and an active case now expose the authoritative basemap from `AppState`. Replacement tests cover successful and failed old-session writes, obsolete pending snapshots and new-session revision acknowledgements. The barrier drains all old write callbacks before activating the candidate; an old-generation completion cannot subsequently arrive through the storage Promise seam.
- Collaborative browser inspection verified the floating case panel and native replacement dialog. Production build passes with a roughly 551 kB initial bundle, retaining the existing 500 kB warning threshold and 1 MB error threshold; the contract is a separate lazy chunk. Existing map-e2e non-null-assertion lint warnings remain non-fatal.

F02 live Mapbox acceptance remains blocked and was explicitly not part of this task. Browser storage remains local to one origin/profile, with no cross-tab lock or synchronization. Server photos are not bundled in JSON.
