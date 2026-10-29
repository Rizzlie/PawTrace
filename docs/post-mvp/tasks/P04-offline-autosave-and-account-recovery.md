# P04 — Durable offline autosave and account-safe recovery

Status: proposed; implementation not started.
Blocked by: P02 — Private case catalogue and relational save.

## Assumptions and sources

- Read [the specification](../spec.md): Authentication and session; Autosave, offline work, and conflicts, plus [execution rules](README.md).
- The user accepted IndexedDB during connectivity loss, synchronization on return, separate pending state per case, seven-day API inactivity, and clearing local copies on explicit logout after warning/export/cancellation.
- The existing [frontend architecture](../../architecture/frontend.md), [document-only persistence ADR](../../adr/0002-one-state-with-document-only-persistence.md), and [store composition ADR](../../adr/0004-compose-case-signal-store-with-events.md) define the committed-document writer, isolated drafts and generation-aware events. Extend those seams rather than creating another state owner.
- P02 provides complete online case persistence, versions and safe stale-write rejection. Photo transport is not required to verify this data-save slice; local JSON export already exists as a recovery primitive.

## Scope

Deliver durable local saving and reconnection for an already running application. Key snapshots, pending revisions and acknowledged server versions by authenticated owner and case. Preserve the newest committed local state on connection loss, case switching, page interruption and delayed completion. Coalesce writes without acknowledging a revision newer than the request actually captured.

Show separate saving/server-saved/local-only/failure states. Retry on reconnection or an explicit action without spinning. Expired sessions pause synchronization, preserve queued data, and require the same identity before resuming. Another account sees only its own data. Prevent a second tab from silently overwriting another tab's unsynchronized local branch.

Integrate conscious logout: warn, offer export/cancel, revoke the session and clear local copies/queues across tabs after confirmation. Wait for actual revocation before reporting success; retain recovery options on a failed request. Abort or fence old writes and callbacks so they cannot recreate cleared records. If local cleanup fails after revocation, report that state accurately and keep application access closed. Route detected version/deletion conflicts to a recoverable paused state; P05 supplies the full chooser/recovery UI.

## Acceptance criteria

- [ ] Offline committed edits are saved in real IndexedDB and survive a browser interruption. Drafts/filters are excluded, and offline startup of the application is not promised.
- [ ] Reconnection saves against the remembered server version. A successful local write never displays server-saved; a failed server write leaves pending data recoverable.
- [ ] Switching cases retains each queue. Switching accounts never renders, exports or submits another owner's data, including after expiry/re-authentication.
- [ ] Delayed saves from an old case, account or session generation cannot acknowledge new work, replace its snapshot or repopulate cleared logout storage.
- [ ] Acknowledgement loss/retry reconciles the committed mutation safely rather than overwriting a newer server version. Coalescing preserves the newest local revision.
- [ ] IndexedDB quota/transaction failure preserves latest in-memory data, shows a persistent warning, and leaves JSON export available. Repeated connection failures do not create an unbounded retry loop.
- [ ] Two tabs editing a pending case do not silently destroy each other's local data. Divergent server/local work pauses with recovery available until P05 resolution is integrated.
- [ ] Expiry preserves queued changes and asks for login; explicit confirmed logout revokes the server session and removes case copies across tabs. Cancelled logout changes neither queue nor session.
- [ ] Online-only create/delete/import and photo uploads have explicit offline states; existing data/geometry edits remain available.

## Verification steps

1. Run focused existing snapshot/store tests and relevant Nx API/workspace/browser checks. Exercise an actual backend plus persistent browser profile and IndexedDB.
2. Load two cases, disconnect, edit both and switch between them. Reconnect and compare committed data on a second browser; close/reopen the profile to inspect durable pending state when the app can load again.
3. Force out-of-order responses, lost acknowledgements and a change while one save is in flight. Verify displayed revision/status and server content, not private callback call counts.
4. Abort an IndexedDB transaction and simulate quota failure, network timeout and server rejection. Export local JSON and prove it contains the latest committed data.
5. Advance server time beyond seven inactive days, reauthenticate as the same account and then a different account, and inspect visible data plus outgoing requests. Exercise logout cancellation, successful cleanup, failed revocation and an old in-flight callback after logout in another tab.
6. Edit the same case from two tabs while offline. Demonstrate both branches remain recoverable and neither is silently overwritten by local storage coordination.

## Discussion topics and decision record

- Settled: local durability before confirmed server acknowledgement, owner/case separation, expiry preserves work, explicit logout clears copies, no full offline startup.
- Record: IndexedDB schema/upgrade, tab coordination, retry/idempotency reconciliation, writer generation fences and failure-state transitions. Existing anonymous data must not be silently attributed to whichever account signs in first; the user will import JSON.
- Define the logout boundary across tabs and cleanup failure behavior. Do not reinterpret the chosen API-activity session timeout as foreground-only activity.

## Scope boundaries

P05 owns the user-facing conflict chooser and deleted-case restore-as-new. P06 owns full ZIP export; JSON-only recovery is sufficient here. No offline new cases/deletion/import/photo uploads, guaranteed tiles, background service worker synchronization or automatic merge is included. No migration of legacy anonymous snapshots into an account.

## Delivery and review record

- Implementation: not started; record implementer/date, browser storage migration, branch/commit/PR.
- Verification: pending; add real IndexedDB, account/tab isolation, response-ordering, expiry/logout and failure evidence with exact commands.
- Standards review: pending; record state ownership, declarative derivations and adapter findings/resolutions.
- Specification review: pending; verify accurate save claims and all data-retention/cleanup paths.
- Remaining blockers/limitations: record untested browser storage or cross-tab scenarios; incomplete recovery behavior prevents done status.
