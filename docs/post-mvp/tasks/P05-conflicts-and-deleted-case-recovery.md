# P05 — Version conflicts and deleted-case recovery

Status: proposed; implementation not started.
Blocked by: P04 — Durable offline autosave and account-safe recovery.

## Assumptions and sources

- Read [the specification](../spec.md): Ownership, catalogue, and API behavior; Autosave, offline work, and conflicts, and [execution rules](README.md).
- The user chose explicit local/server selection with save times and local export, without automatic merging. A remotely deleted case may be exported locally or saved as a new case, not silently resurrected.
- P02 supplies transactional version checks and full case reconstruction. P04 supplies durable owner/case local branches, paused sync and generation-safe acknowledgements.
- [JSON v1](../../architecture/case-json-v1.md) remains the local recovery format; version/owner metadata is not added to the exported domain document.

## Scope

Deliver a conflict workflow from rejected stale write through visible comparison/choice to confirmed recovery. Stop automatic writes for the conflicting case, identify local and server save times and offer JSON export before either branch is discarded. Let the user keep local content or load the server version, but recheck the server version at the final write. Preserve both branches while the choice is pending, cancelled, interrupted or rejected again.

Handle a remotely deleted case separately: explain deletion, offer local export or online creation of a new private case with a new identity, and retain unavailable photo references as clearly reported placeholders rather than bypassing deleted-asset authorization. Integrate the same version conflict surface for rename/delete/replacement races when those operations are present; do not implement import here.

## Acceptance criteria

- [ ] Two devices editing the same base version produce a visible conflict, not last-writer-wins replacement. The local branch remains exportable while the dialog is open.
- [ ] Keeping local commits against the latest explicitly chosen version; keeping server replaces local only after safe local persistence. Failure or cancellation retains recoverable local data.
- [ ] Another server update while a choice is pending causes a fresh conflict instead of applying an obsolete approval. Repeated requests remain version/idempotency safe.
- [ ] Save-time labels distinguish local capture time, server save time and factual incident time; unknown values are not invented.
- [ ] A remotely deleted case never reappears under its old identity through autosave. Restore-as-new online creates a different owned case; cancellation/failure does not lose the local version.
- [ ] Another account cannot read/export the conflict branches. Resolution in one tab cannot make another tab silently overwrite it or treat stale state as saved.
- [ ] Missing/deleted originals remain unavailable; restore-as-new never grants access to files based solely on old filenames.

## Verification steps

1. Run relevant Nx API/workspace/browser checks with two independent contexts, real database versions and actual IndexedDB queues.
2. Edit offline in context A; save different data in B; reconnect A. Download its local export and inspect the original branch before testing each choice.
3. Update again from B while A's chooser is open. Verify the second conflict and retained local branch. Inject failure during the chosen write/local replacement and retry.
4. Delete from B while A holds offline edits. Test export, restore-as-new, cancellation, a failed creation response and retry without duplicate new cases.
5. Repeat with multiple tabs, account expiry/change and a missing original. Check outgoing identifiers, final revisions, displayed status and access denial.

## Discussion topics and decision record

- Settled: explicit whole-version selection, no merge, recoverable cancellation, new identity after server deletion.
- Record: comparison presentation, versioned choice protocol, simultaneous tab resolution and new-case idempotency behavior. Retaining the local branch until success is a completion condition, not an optional UX detail.
- A history browser, per-field reconciliation or restoring revoked/deleted asset access changes scope.

## Scope boundaries

No collaborative editing, conflict merging, server history retention, offline creation, or file import is implemented here. Local data export uses JSON; a complete original-photo ZIP may require online access and P06.

## Delivery and review record

- Implementation: not started; record implementer/date, branch/commit/PR and any protocol decisions.
- Verification: pending; attach both conflict choices, re-conflict, remote deletion and failure/cancellation evidence.
- Standards review: pending; record state-machine/adapter findings and fixes.
- Specification review: pending; explicitly inspect every branch-discard and new-identity path.
- Remaining blockers/limitations: record any unresolved multiple-tab or missing-photo behavior; avoid an unqualified completion claim.
