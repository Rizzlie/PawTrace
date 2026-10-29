# P03 — Private case photos

Status: proposed; implementation not started.
Blocked by: P02 — Private case catalogue and relational save.

## Assumptions and sources

- Read the [specification](../spec.md): Ownership, catalogue, and API behavior; Photos and transfer format, and [task execution rules](README.md).
- The existing [image-processing architecture](../../architecture/image-processing.md) defines persistent originals, HEIC handling, derivatives and processing recovery. [JSON v1](../../architecture/case-json-v1.md) defines filenames, metadata and attachment relationships.
- P02 supplies an owned case and relational attachment references. P01 supplies authentication. The current MVP's anonymous asset routes and disk metadata alone do not prove case ownership.

## Scope

Deliver the existing upload/attach/view/retry photo workflow for a private server-backed case. Associate original storage and metadata with the target case and owner; integrate profile, point, history, area and check attachments. Preserve original bytes and existing processing states, thumbnails, previews and HEIC behavior.

Authorize every asset endpoint, including metadata, status, original, thumbnail, preview and retry. Do not expose the original asset directory as a public static path. Decouple internal storage keys from imported logical filenames so different cases and owners can safely reuse names. A filename in JSON must never claim another case's file.

Make upload publication and attachment saves recoverable when either the filesystem or database fails. Keep uploaded-but-not-yet-attached assets safely staged/owned and define cleanup so cancellation, replacement and deletion do not break committed cases. Keep generation/session checks so a late upload/processing callback does not attach to a different open case or account. Disable new uploads offline with a clear explanation.

## Acceptance criteria

- [ ] A case owner uploads, attaches, reopens and downloads a photo in each supported attachment location; original bytes match the upload.
- [ ] JPEG/WebP and representative HEIC input retain the existing preview/thumbnail and original-view behavior, including processing failure/retry and restart recovery.
- [ ] Anonymous and foreign-owner direct calls cannot access any original, derivative, metadata, status or retry path. An old anonymous URL does not bypass the new checks.
- [ ] Same logical filenames in separate cases cannot collide. A JSON reference or guessed filename cannot bind to a foreign original, even when its name matches.
- [ ] Upload/DB/processing failures leave previously committed photos readable and produce a recoverable state. Failed writes never attach a partial file.
- [ ] Case/account switching during upload or processing cannot attach or reveal the result in another context. Removing an attachment does not delete files still required by committed data or staging.
- [ ] Photo data and ownership survive application/container recreation with the persistent directory and database. New photo uploads require connectivity; unavailable originals remain explicit placeholders.

## Verification steps

1. Run relevant Nx API/image-processing/workspace checks and photo browser scenarios. Use real temporary storage and PostgreSQL for ownership/publication integration.
2. Exercise every HTTP asset route as owner A, owner B and anonymous. Test identical logical filenames, direct stale URLs, metadata enumeration and an import-style foreign reference.
3. Upload known fixture bytes, retrieve originals and compare hashes. Verify actual JPEG/WebP/HEIC thumbnails/previews and processing retry after failure/restart.
4. Inject failed disk publication and failed metadata/attachment commit separately. Inspect the last committed case and original availability; ensure staging is not public and can be cleaned safely.
5. Switch case/account during upload; disconnect before uploading; cancel a photo edit; remove and reattach a photo. Demonstrate accurate UI states without losing the previous document.

## Discussion topics and decision record

- Settled: persistent local original storage for one shared instance; ownership covers all derivatives and processing routes; uploads are online-only.
- Record: asset identity/path strategy, case-scoped logical-name mapping, staging/attachment ownership and safe cleanup rules. Existing global filenames alone are not authorization.
- Record technical upload/decoder safeguards actually introduced; no business storage quota or cloud object-store requirement was agreed.

## Scope boundaries

Archive generation/restoration belongs to P06/P08. No automatic claiming of legacy anonymous photos, deduplication across owners, object storage, multiple application replicas or offline upload queue is included. Preserve image semantics rather than expanding media editing or video support.

## Delivery and review record

- Implementation: not started; record implementer/date, storage migration decisions, branch/commit/PR.
- Verification: pending; attach endpoint isolation matrix, original-byte evidence, processing/restart checks and injected-failure results.
- Standards review: pending; record adapter/state-boundary findings and fixes.
- Specification review: pending; explicitly review every asset route and attachment location.
- Remaining blockers/limitations: list any codec, original recovery or live-runtime checks still unavailable before marking done.
