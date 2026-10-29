# P08 — Complete ZIP import and replacement

Status: proposed; implementation not started.
Blocked by: P07 — Safe JSON import and replacement.

## Assumptions and sources

- Read [the specification](../spec.md): Photos and transfer format, and [execution rules](README.md). P06 defines root `case.json` plus `photos/<logical-original-filename>`; P07 defines confirmation/identity/version replacement behavior.
- P03 supplies owned/staged original handling and derivative generation. [Image-processing architecture](../../architecture/image-processing.md) and [JSON v1](../../architecture/case-json-v1.md) remain the media/domain baseline.
- ZIP is the complete transfer format: originals referenced anywhere or listed in assets are required. Derivatives may be regenerated. Incomplete originals are permitted only through the separate warned JSON-only import path.

## Scope

Extend file import to ZIP and restore the full case with unchanged original bytes. Validate the archive structure, JSON schema and relationships, original inventory and file safety before confirmation/commit. Use case-private staging paths independent of archive entry names. Reuse P07's new/open case, prior-export, cancellation and replacement UI; there is one replace-only behavior, not a second merge-capable importer.

Stage originals safely before the transactional relational switch, retain old originals until replacement succeeds, and recover/clean abandoned staging after failure or restart. Regenerate thumbnails/previews through the current pipeline; do not require exported derivative filenames to exist in the ZIP. Never report file publication and database commit as a single cross-resource transaction without a recovery mechanism.

Handle same logical filenames with different bytes safely across cases and replacements. Authorize the target and recheck its version at activation. Bound archive parsing/extraction resources and make the chosen technical limits configurable/documented where appropriate, with actionable rejection before mutation.

## Acceptance criteria

- [ ] A ZIP from P06 restores all case data, relationships and original bytes into a new case or over an open case, following P07's identity/owner rules.
- [ ] Restored JPEG/WebP/HEIC originals are usable and derivatives regenerate; the imported file does not need bundled server-generated thumbnails/previews.
- [ ] Missing referenced/manifest originals, corrupt archives, unsupported JSON, ambiguous duplicate entries and unsafe/traversing/absolute paths are rejected before activation. A bad ZIP never silently falls back to incomplete JSON.
- [ ] Archives exceeding documented entry/expanded-size/processing bounds fail clearly without replacing the old case or exhausting unbounded resources.
- [ ] Same filenames with different bytes cannot overwrite another case's data or expose a staged file. Cancellation and failures retain the old committed case and all its readable originals.
- [ ] Disk failure, DB rollback, process interruption and a concurrent version change each leave either the old complete committed state or the new complete committed state, with a recoverable staging record; no committed reference points at a partially published original.
- [ ] Lost acknowledgement retries do not create duplicate cases/assets or repeat an obsolete overwrite. Cleanup does not remove files required by another committed case or active operation.
- [ ] Offline/expired/foreign-owner import is denied. Only the successfully committed candidate becomes active in browser/local state.

## Verification steps

1. Run relevant Nx API/workspace/browser/image checks with real PostgreSQL/PostGIS and a temporary filesystem. Export through P06, import through the UI/API and compare domain data plus all original hashes.
2. Cover new case, repeated overwrite, another case with the same IDs/filenames, and a replacement where one logical filename now has different bytes. Verify original access under both owners.
3. Build malformed archive fixtures: traversal, duplicate root/entry, missing original, invalid nested relation, corrupt compressed data and bounded expansion violation. Assert unchanged prior case/files for each.
4. Inject interruption before publication, between staging and DB switch, during commit and after commit before acknowledgement. Restart and exercise recovery/cleanup; inspect accessible content, not only directory presence.
5. Verify derived-image regeneration and retry for HEIC; cancel before confirmation and while preparation is active; change target version in another context and prove safe conflict rejection.

## Discussion topics and decision record

- Settled: complete originals, one archive contract, replace only, confirmed target, no old-photo loss on failure, derivatives regenerated.
- Record: ZIP library, exact safety/resource bounds, staged publication/commit/recovery protocol, filename collision handling, metadata refresh and cleanup. These are technical constraints, not an invented per-user business quota.
- If staged file and row lifecycles cannot satisfy the old-or-new invariant, resolve that design here before claiming atomic replacement.

## Scope boundaries

No arbitrary directory import, legacy photo claiming, archive merge, image recompression, provider-specific storage or full-instance restore. Do not expand into ZIP analysis; the archive is a transfer artifact. P10 verifies complete application integration and backup restoration separately.

## Delivery and review record

- Implementation: not started; record implementer/date, archive limits/recovery design, branch/commit/PR.
- Verification: pending; add archive inventory, original hashes, malicious/invalid fixture results and crash-recovery evidence with exact commands.
- Standards review: pending; record filesystem/database boundary and resource-handling findings/fixes.
- Specification review: pending; explicitly review replacement identity, completeness and old-original retention.
- Remaining blockers/limitations: document any untested crash window/codec/platform behavior before marking done.
