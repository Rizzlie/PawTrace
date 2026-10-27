# workspace

Browser feature integration, separate from the Leaflet adapter and server code.

`AppState` owns one private signals root: the committed document, transient UI, the editor slot (reserved for F06 onward), and local persistence bookkeeping. Components consume computed projections and explicit commands. `SnapshotWriter` serializes full snapshots with one active transaction and the latest pending revision. Failed autosaves retain memory and stop automatic draining until the next committed change or explicit retry. Import/new-case replacement blocks mutations, drains an active write, discards obsolete queued writes, persists the candidate and only then changes the active document/session.

The state shape, fresh-session defaults and save-status rules live in `workspace-state.ts`. Document creation, confirmation summaries and map-view comparisons live in `case-document.ts`. These are ordinary functions with no independent state; `AppState` keeps the lifecycle commands and `SnapshotWriter` keeps transaction ordering.

`CaseControls` provides new case, import confirmation with case/animal/count summary, cancellation, export and storage recovery. Export captures the current committed snapshot and adds only file metadata; it never changes the document, revision or save acknowledgement. Invalid startup snapshots are retained until explicit replacement. The case contract loads asynchronously for validation/file transfer to keep it outside the initial map bundle.

Map center, zoom and the requested basemap are committed through the same writer without changing factual case timestamps. A map-provider fallback does not erase a stored satellite preference; explicitly choosing OSM does. View restoration does not emit a user edit. Address-search navigation updates the current document's view when a case is active.

`AddressSearch` uses Signal Forms and submits only on Enter or the search button. Its `resultSelected: AddressSearchResult` output contains an ID, label, latitude and longitude. The consumer may move the map (F03) or propose draft coordinates for explicit point confirmation (F07); selection itself never creates a point. Search input/results are transient UI state, outside the future case document.

`AddressSearchClient` calls the same-origin `/api/address-search?q=...`, validates the transport response, and performs no automatic retries. There are no direct browser requests to the geocoder.

Run `npm exec nx run workspace:typecheck`, `npm exec nx run workspace:test` and `npm exec nx run workspace:lint`. Browser acceptance is in `apps/web-e2e/src/address-search.spec.ts` and `apps/web-e2e/src/case-persistence.spec.ts`.
