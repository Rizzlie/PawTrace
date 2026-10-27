# Browser persistence

`BrowserSnapshot` reads and writes the complete case document through `idb` in the `pawtrace` IndexedDB database (`snapshots`, key `current`). A write succeeds only after its transaction completes; an aborted transaction preserves the previous snapshot. Connections close after each operation so reopening/retrying does not retain a failed connection. Validation and case activation belong to the workspace, outside the transaction.

`BrowserFiles` reads selected JSON files and downloads serialized exports. It owns browser file/Blob APIs, without deciding which case is active. No case data goes to the API.

`SnapshotStorage` is the persistence boundary used by the revision-aware workspace writer. The adapter owns no competing case state or autosave queue.

Run `npm exec nx run browser-persistence:test` and `npm exec nx run browser-persistence:typecheck`. Tests use fake-indexeddb at the database boundary; real Chromium restoration, failed transactions and reopening a browser profile are covered by `apps/web-e2e/src/case-persistence.spec.ts`.
`hasSeenMapHelp` / `rememberMapHelp` store the versioned first-visit help preference in localStorage (`pawtrace.map-help.seen.v1`). This is a browser UI preference, independent of case snapshots and JSON. Storage failures are contained so the header help dialog remains usable.
