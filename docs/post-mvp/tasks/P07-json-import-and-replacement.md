# P07 — Safe JSON import and replacement

Status: proposed; implementation not started.
Blocked by: P06 — Complete JSON and ZIP export.

## Assumptions and sources

- Read [the specification](../spec.md): Photos and transfer format; Ownership, catalogue, and API behavior, and [execution rules](README.md).
- [JSON v1](../../architecture/case-json-v1.md) is the supported legacy file contract. The user will import an existing JSON file; no migration/claiming of the previous installation is required.
- P02 provides transaction/version checks and relational mappings; P03 provides safe owned-asset associations; P06 provides the prior-export option. The existing committed-document replacement barrier remains applicable to local/editor state.
- The user explicitly removed merging. Import over an open case preserves its identity/owner and replaces content; no open case means create a new private case.

## Scope

Deliver JSON file selection, validation summary, missing-photo warnings, prior export, cancellation and confirmed server replacement/create. Map every validated v1 value into the relational model. Imported owner/session/revision is never trusted; preserve the target case identity when replacing, use a new identity when creating, and document root-metadata remapping. Child IDs remain scoped to the target case.

Validate the complete candidate and its relationships before activation. Keep the old case, pending local content and readable owned originals intact while validation/confirmation is open. Coordinate existing autosave/editor operations through a replacement barrier so delayed old writes cannot undo the imported result. A version change before commit rejects the candidate safely and surfaces the current conflict mechanism without silently reapplying approval.

JSON references without available originals remain placeholders with warnings. Retain an already owned target asset only when association is safe; a matching filename never claims another case's file. Create/replacement requires connectivity, including after a preview prepared while online. Reconcile lost responses without duplicate new cases or repeated blind replacement.

## Acceptance criteria

- [ ] The existing minimal/complete v1 JSON and a representative user-style MVP export can be imported without dropping domain fields or changing event precision.
- [ ] Open-case replacement preserves target identity/owner and replaces content only after explicit confirmation. With no open case, import creates a new case, even if a source ID matches another existing case.
- [ ] Summary, prior export and cancellation are available before replacement. Cancelling or closing preview changes neither current server content nor recoverable local content.
- [ ] Malformed/unsupported JSON, invalid IDs/relationships, failed DB writes and stale versions leave the previous complete case intact. No partial relational update is visible.
- [ ] Missing original warnings and placeholders are accurate; foreign filenames cannot expose or claim an existing original. Other cases are unaffected.
- [ ] In-flight autosave/editor completions cannot overwrite the imported state or falsely acknowledge it. Successful replacement establishes a new local generation and version basis.
- [ ] Offline/session-expired import cannot commit; recovery retains the current case. A committed-but-unacknowledged creation or replacement can be reconciled safely.
- [ ] Import does not offer merge, implicitly combine records, or change file schema merely to attach server ownership metadata.

## Verification steps

1. Run relevant Nx contract/API/workspace/browser checks. Import/export through the actual owned HTTP API and real PostgreSQL/PostGIS, using the existing complete/minimal fixtures.
2. Compare all reconstructed fields, excluding only documented target-root remapping/export metadata. Include duplicate source IDs in different target cases, null/absent values, all time variants and geometry kinds.
3. Test new-case versus open-case paths, cancel, prior export, missing photos and a foreign-owner filename. Attempt a direct replacement API call against another owner's case.
4. Inject invalid nested references, database failure, offline transition, expired session and a version change while the confirmation is open. Prove unchanged old content and originals.
5. Delay an old autosave until replacement, then release it; lose the replacement response and retry. Verify final document/version, no duplicate creation and a truthful save indicator.

## Discussion topics and decision record

- Settled: replace-only JSON import, confirmation/export/cancel, target identity retained, new identity without an open case, warnings for unavailable photos.
- Record: target-root metadata policy, ID namespace mapping, safe retained-original matching and replacement generation/version handling. Preserve user facts rather than treating import time as their event time.
- Any proposal to claim anonymous/foreign originals or merge documents requires a scope change, not an importer shortcut.

## Scope boundaries

No ZIP extraction (P08), legacy server-photo migration, unsupported-version converter, merge or offline import. This task must be usable without P04/P05 having landed: provide safe version rejection using P02, and integrate their shared queue/conflict behavior when present. P10 checks the combined integration.

## Delivery and review record

- Implementation: not started; record implementer/date, mapping policy, branch/commit/PR.
- Verification: pending; add fixture round trips, before/after replacement, cancellation/rollback, ownership and delayed-write evidence.
- Standards review: pending; record adapter/state-barrier findings and resolutions.
- Specification review: pending; check every field and all identity/owner-preservation cases.
- Remaining blockers/limitations: record unsupported fixtures or unresolved photo ownership; incomplete safe replacement prevents done status.
