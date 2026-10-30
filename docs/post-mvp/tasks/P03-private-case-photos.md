# P03 — Private case photos

Status: implemented on `feat/p03-private-photos-impl`; acceptance verified; standards and specification reviews pending.
Blocked by: none. P02 is merged through [PR #21](https://github.com/Rizzlie/PawTrace/pull/21).

## Assumptions and sources

- Read the [specification](../spec.md): Ownership, catalogue, and API behavior; Photos and transfer format, and [task execution rules](README.md).
- The existing [image-processing architecture](../../architecture/image-processing.md) defines persistent originals, HEIC handling, derivatives and processing recovery. [JSON v1](../../architecture/case-json-v1.md) defines filenames, metadata and attachment relationships.
- P02 supplies an owned case and relational attachment references. P01 supplies authentication. The current MVP's anonymous asset routes and disk metadata alone do not prove case ownership.

## Scope

Deliver the existing upload/attach/view/retry photo workflow for a private server-backed case. Associate original storage and metadata with the target case and owner; integrate profile, point, history, area and check attachments. Preserve original bytes and existing processing states, thumbnails, previews and HEIC behavior.

Authorize every asset endpoint, including metadata, status, original, thumbnail, preview and retry. Do not expose the original asset directory as a public static path. Decouple internal storage keys from imported logical filenames so different cases and owners can safely reuse names. A filename in JSON must never claim another case's file.

Make upload publication and attachment saves recoverable when either the filesystem or database fails. Keep uploaded-but-not-yet-attached assets safely staged/owned and define cleanup so cancellation, replacement and deletion do not break committed cases. Keep generation/session checks so a late upload/processing callback does not attach to a different open case or account. Disable new uploads offline with a clear explanation.

## Acceptance criteria

- [x] A case owner uploads, attaches, reopens and downloads a photo in each supported attachment location; original bytes match the upload.
- [x] JPEG/WebP and representative HEIC input retain the existing preview/thumbnail and original-view behavior, including processing failure/retry and restart recovery.
- [x] Anonymous and foreign-owner direct calls cannot access any original, derivative, metadata, status or retry path. An old anonymous URL does not bypass the new checks.
- [x] Same logical filenames in separate cases cannot collide. A JSON reference or guessed filename cannot bind to a foreign original, even when its name matches.
- [x] Upload/DB/processing failures leave previously committed photos readable and produce a recoverable state. Failed writes never attach a partial file.
- [x] Case/account switching during upload or processing cannot attach or reveal the result in another context. Removing an attachment does not delete files still required by committed data or staging.
- [x] Photo data and ownership survive application/container recreation with the persistent directory and database. New photo uploads require connectivity; unavailable originals remain explicit placeholders.

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

Decisions taken (implementer, 2026-10-30):

- **Test seams.** I used the seams the user accepted in the [specification's testing decisions](../spec.md#testing-decisions). (1) Authenticated HTTP over real PostGIS and a real temporary directory: `case-photos.spec.ts`, plus `assets.spec.ts` and `image-processing.spec.ts`, which moved onto the real application because photos no longer exist outside an owned case. There are no repository mocks. SQL is used only to inject triggers, to place one identical logical filename and to look up rows. Filesystem faults use the existing `rename`/`rm` wrappers, filtered by path because the processing queue runs concurrently. (2) Playwright against the real application, including a new owner/stranger/anonymous scenario in the serial `ownership` project. (3) Store and component seams in `photo-workflow.spec.ts` and `photo-transfers.spec.ts`.
- **Routes.** Photos live under `/api/cases/:caseId/assets`. Rejected alternative: keeping `/api/assets/:filename` and finding the owner from the name, because a logical filename is only unique within a case. The old URLs stay closed through a small `LegacyAssetsController`: 401 without a session, 404 with one, no session activity. A route that simply vanished would answer an anonymous caller 404 and lose P01's denial tests.
- **Asset identity and path strategy.** Migration [`0002_case_photos.sql`](../../../apps/api/src/database/migrations/0002_case_photos.sql), generated by drizzle-kit, adds `stored_photo(storage_id uuid PK, case_id → owned_case ON DELETE CASCADE, filename, created_at)` with `UNIQUE (case_id, filename)`, and the `photo_removal` outbox. `storage_id` and the upload's logical filename are two independent random UUIDs, so a filename reveals no path and a path reveals no filename. Disk layout is `ASSET_DIRECTORY/objects/<storage_id>/{original, metadata.json, thumbnail.png, preview.png}`. The record on disk no longer holds a filename. Ownership comes from `owned_case.owner_id` through the case, not a second owner column that could disagree.
- **Case-scoped logical names.** `PhotoRepository.find(owner, case, filename)` is the only way from HTTP to a storage key, and it runs before any filesystem access. Only uploads write `stored_photo`; `photo_reference` and `photo_asset` from a document never do. So a JSON reference matching a foreign filename saves as a valid unavailable reference and reaches no bytes. The same rule applies between two cases of one owner. P08 will add the second writer, for archive restoration.
- **Staging and publication.** Bytes stream into `staging/<uuid>/` and the format and record are written there. Then: commit the `stored_photo` row, atomically rename the directory into `objects/`, and confirm the row still exists. The row goes first deliberately. If the process dies after the commit, the row names no file and no client knows its filename, whereas the reverse order would leak an unreachable directory that only a disk-versus-database comparison could find. A failed rename deletes the row. A case deleted during the upload returns 404 and leaves nothing behind. `staging/` is emptied at every start, which is safe because the application has not started listening and the deployment is a single instance.
- **Attachment.** There is no staged/attached status. An asset is attached exactly when the committed document references it, so nothing can disagree with the document, and a failed save attaches nothing.
- **Cleanup.** Unlinking, cancelling an editor and replacing case content delete no file. An uploaded photo stays private to its case until the case is deleted. A case deletion writes its storage ids to `photo_removal` in the same transaction, removes the directories after the commit, and retries at the next start or deletion if that fails. Rejected alternatives: age-based reclamation of unattached uploads, because an older export or P04's pending offline edit may still name them and no quota was agreed; and removing every directory the database does not know, because a restored or empty database would then erase all originals. A test proves such directories survive a start.
- **Technical upload and decoder safeguards.** Introduced: ownership is checked before any body byte is read; multipart bodies are never written outside `staging/`; download names are percent-encoded in `Content-Disposition`; `Cache-Control: no-store` applies to every photo response; a storable-text check returns 404 for names PostgreSQL cannot compare. No file-size or count limit was added, since none was agreed, and the existing decoder bounds in the [processing architecture](../../architecture/image-processing.md) are unchanged.
- **Failure responses.** Disk failure stays the retryable 507 `original_storage_failed` with its real `systemCode`. A database failure during publication is a retryable 503 `photo_publication_failed`. The verifier's read-only check found that Node's recursive `mkdir` reports `EROFS` as `ENOENT`, so the leaf directory is now created non-recursively.
- **Legacy files.** MVP `<uuid>/` directories in the same asset directory are ignored: never served, processed, claimed or deleted, as the scope boundary requires.
- **Late results.** The browser keeps the existing `PhotoTarget` (case, session generation, editor) checks, and uploads and reads now go to that captured case. After a logout the old account's cookie cannot reach the new account's case, and the server re-checks ownership regardless.
- **Offline.** The file input and the upload retry are disabled while offline, with an explanation; draft text is retained. Existing photos remain explicit placeholders when unavailable. This uses the browser's connectivity hint, and the server stays the authority.
- **Test infrastructure.** `api:test` files now run serially (`fileParallelism: false`), because every application start drains the shared removal outbox and could otherwise take another spec's rows. The compiled browser host now receives `image-worker.mjs`; without it every browser derivative failed with `worker_exited`. The two production-image verifiers could not run since P01, because the image needs a database and has no test login. They now start a disposable PostGIS container and seed a signed session through `tools/owned-asset-runtime.mjs`, so requests still cross the real guard.
- **Docs and e2e adaptation.** The three `[P03 ownership required]` scenarios are enabled without `fixme`. Their only changes are the case-scoped URL and using the browser's authenticated request context instead of the anonymous `request` fixture. `denies ownerless uploads…` became `rejects an unsupported upload…`, because that upload now reaches the real route.

## Scope boundaries

Archive generation/restoration belongs to P06/P08. No automatic claiming of legacy anonymous photos, deduplication across owners, object storage, multiple application replicas or offline upload queue is included. Preserve image semantics rather than expanding media editing or video support.

## Delivery and review record

- Implementation: Claude sub-agent, 2026-10-30, branch `feat/p03-private-photos-impl` based on `feat/p03-private-photos` (`794dcfd`, same commit as `main`). Schema migration `0002_case_photos`, generated by drizzle-kit; `0000` and `0001` are unchanged. No storage data migration: P01 made every earlier photo unreachable, and MVP directories stay where they are, ignored. PR: none yet; the parent handles integration.
- Key files: `apps/api/src/app/assets/` (`assets.controller.ts`, `asset-uploads.ts`, `original-assets.ts`, `image-processing.ts`, `photo-cleanup.ts`), `apps/api/src/cases/` (`photo-repository.ts`, `request-scope.ts`, `schema.ts`), `libs/web/workspace/src/lib/photos/`, `with-photo-processing.ts`, `apps/api/tests/photo-application.ts`, `tools/owned-asset-runtime.mjs`.
- Verification ran on real PostGIS 17-3.5 and Redis from `docker compose -p pawtrace-p03-test -f compose.auth-test.yaml up -d --wait`.
- `CI=true NX_DAEMON=false npm exec nx run-many -- -t typecheck lint test build -p api web web-e2e workspace case-domain browser-persistence map-engine shared-ui --output-style=static --skip-nx-cache`: exit 0, no cache. Tests: api 110, workspace 86, case-domain 127, map-engine 35, web 2, browser-persistence 2. Lint: only the earlier `playwright/no-conditional-in-test` warning. The production web build reports the existing initial-bundle warning: 989.02 kB against the 500 kB warning budget. This run preceded one later test-host-only edit (`apps/api/tests/browser-host.ts`), after which `api:typecheck` passed again and the browser suite ran twice. The mid-upload deletion test was added before this run.
- `CI=true NX_DAEMON=false npm exec nx run web-e2e:e2e -- --workers=2 --reporter=line --output-style=static`: 89 passed, 0 skipped, 0 failed, 0 flaky, on two consecutive runs of the final code (exit 0 both times). The three `[P03 ownership required]` scenarios are enabled without `fixme`. Earlier runs on this branch each failed for a recorded cause:
  - Two wrong expectations in my new scenario (a re-import without `exportedAt`, and a title the import replaces).
  - A missing `image-worker.mjs` in the compiled browser host: every derivative failed until `tools/copy-auth-test-migrations.mjs` copied it.
  - A `/restart` timeout in the existing `my-cases` scenario, seen on one retry and as one flaky result. A socket that has sent no request kept `server.close()` open for over 20 s in a plain Node 24.16.0 reproduction, consistent with a browser preconnect and with the timeout in P02's record. The test host now drops connections during its restart. The reproduction shows the mechanism; the exact socket in the browser run was not captured.
- Endpoint isolation matrix (`case-photos.spec.ts`, repeated through the browser in `my-cases.spec.ts`):

  | Route under `/api/cases/:id/assets` | Owner  | Other owner, real case | Other owner, own case + guessed name | Anonymous |
  | ----------------------------------- | ------ | ---------------------- | ------------------------------------ | --------- |
  | `POST` upload                       | 201    | 404                    | n/a                                  | 401       |
  | `GET /:filename`                    | 200    | 404                    | 404                                  | 401       |
  | `GET /:filename/metadata`           | 200    | 404                    | 404                                  | 401       |
  | `GET /:filename/thumbnail`          | Status | 404                    | 404                                  | 401       |
  | `GET /:filename/preview`            | Status | 404                    | 404                                  | 401       |
  | `POST /:filename/retry`             | 201    | 404                    | 404                                  | 401       |
  | Legacy `/api/assets/**`             | 404    | 404                    | 404                                  | 401       |

  "Status" means 200 when the derivative is ready and 404 otherwise. Every foreign 404 body is exactly `{ "error": "not_found" }`, identical to an absent filename. A URL stops working after logout (401).

- Original-byte evidence: SHA-256 equality through HTTP for JPEG and WebP fixtures and for one upload in each of the eight locations (profile, point, area, area check, observation, action, point check, note), after an application restart and strict document equality on reopening. The browser compares bytes for a real PNG.
- `CI=true NX_DAEMON=false npm exec nx run api:verify-images -- --output-style=static`: exit 0 on the production image, 24 PASS lines, with sharp 0.35.5, libvips 8.18.7 and libheif 1.23.7. It covers JPEG, WebP, PNG, 16 HEIC fixtures with dimensions and unchanged SHA-256, corrupt input, retry during active processing (409), derivative-write failure, worker SIGKILL, container replacement while decoding, processing timeout, and a real 192 MiB cgroup OOM with recovery. The 48 MP fixture peaked near 304000 KiB.
- `CI=true NX_DAEMON=false npm exec nx run api:verify-assets -- --output-style=static`: exit 0, 4 PASS lines: format and 32 MiB hash round trips, container replacement, a read-only mount (`EROFS`, 507) and a real full disk (`ENOSPC`, 507) with recovery. Both verifiers ran on the final product code. They use a seeded session because the production image has no test login; real Google login was not exercised here.
- Injected failures (`case-photos.spec.ts`):
  - Disk publication (`ENOSPC` on the rename): 507, no row, staging empty, committed photo unchanged, retry succeeds.
  - Same, with cleanup also failing (`EROFS`): the primary 507 `ENOSPC` is preserved.
  - Metadata commit (a trigger inside the real insert): 503, staging empty, retry succeeds.
  - Attachment commit (a trigger on `photo_reference`): 500, same version, previous document and original intact.
  - Removal failure during case deletion: 204, the case is gone over HTTP, and the directories are removed on the next start while another case's photo stays.
  - Case deleted during a streaming upload: 404, nothing left in `objects/` or `staging/`.
  - Unknown published directory at start: untouched.
- Processing and restart: `image-processing.spec.ts` covers derivatives, decoder failure and retry, idempotent retries, pending recovery after restart and derivative-write recovery, through the owned routes.
- Recreation: `docker compose -p pawtrace-p03-test -f compose.auth-test.yaml up -d --force-recreate --wait postgres` changed the container (`0e9a1004b1bd` → `198bd97e3349`) on the same volume, with 345 `stored_photo` rows and an identical digest `67a8f0cb236678cae3b6ed6c2ceac1b3` before and after, and 3 applied migrations. The browser suite then passed against it. Application-container replacement with the retained asset mount is covered by both verifiers.
- Browser states: `photos.spec.ts` and `my-cases.spec.ts` show switching case during a held upload, logging out and signing in as another account during a held upload, an offline explanation with the draft retained, cancelling an edit, and unlink and reattach without a new upload.
- `CI=true NX_DAEMON=false npm exec nx run api:db-generate -- --output-style=static`: "No schema changes, nothing to migrate". `npm exec nx format:check -- --base=main`: exit 0.
- Test order: the first isolation test was run red before the routes existed. Later tests were mostly written beside the code they cover, so I checked them by mutation, restoring the code each time. Removing the owner filter, removing the case filter, not writing the removal outbox, keeping the row after a failed publication, keeping staging across a restart and allowing upload offline were each caught by a named test. Removing the ownership recheck in `register` survived; I added the mid-upload deletion test and it then failed that mutation.
- Standards review: pending; record adapter/state-boundary findings and fixes.
- Specification review: pending; explicitly review every asset route and attachment location.
- Remaining blockers/limitations: no acceptance check is outstanding. Limitations:
  1. The interface offers uploads in the profile, history-entry and area-check editors, as in the MVP. `point.photos` and `area.photos` round-trip through the API, but no editor attaches to them.
  2. Unattached uploads, including cancelled ones, are kept until their case is deleted, because no quota was agreed and older exports may still name them. Disk use grows accordingly.
  3. A failed removal is retried only at the next start or case deletion; there is no background timer.
  4. A process death between the row commit and the rename leaves a row with no file. No client knows its filename and case deletion clears it. A lost upload response can leave one extra unattached file; the interface never re-posts automatically.
  5. The application's own shutdown can still wait on an unused browser socket; only the test host drops connections. Docker's stop timeout bounds it in production, and restart recovery covers the result.
  6. Photo HDR, gain-map and arbitrary camera-profile coverage is unchanged from F12: synthetic fixtures, not every phone.
  7. The production `compose.yaml` stack was not started, and real Google login was not used for photo checks. P10 owns production-like Compose acceptance. The README's historical MVP backup section still describes the single-browser flow, which P10's runbook replaces.
  8. MVP photos stay on disk, unreachable, until an operator removes them; P08 restores originals from a ZIP.
