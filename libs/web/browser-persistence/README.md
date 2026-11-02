# Browser persistence

`BrowserFiles` reads selected JSON files and downloads serialized exports. It owns browser file/Blob APIs, without deciding which case is active.

`hasSeenMapHelp` / `rememberMapHelp` store the versioned first-visit help preference in localStorage (`pawtrace.map-help.seen.v1`). This is a browser UI preference, independent of case data and JSON. Storage failures are contained so the header help dialog remains usable.

`CaseCopies` implements P04's owner/case/tab-keyed committed snapshots in the separate `pawtrace.owned-cases` IndexedDB database. Strict transactions include the logout epoch check; only transaction completion acknowledges durability. Web Locks distinguish live tab branches. Logout intent survives a failed deletion transaction, and successful cleanup retains a monotonic fence against delayed callbacks. No anonymous snapshot is read or migrated. The workspace's `DurableCaseStorage` owns synchronization at the existing snapshot seam; `CaseStore` remains the active document owner. See the [P04 record](../../../docs/post-mvp/tasks/P04-offline-autosave-and-account-recovery.md).

Run `npm exec nx run browser-persistence:typecheck` and `npm exec nx run browser-persistence:lint`; real IndexedDB behavior is covered by `web-e2e:e2e`'s recovery project.
