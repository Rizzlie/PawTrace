# F13 — Photo attachments and viewing

Status: done
Depends on: F06, F08, F10, F11, F12

## Goal

Attach and inspect real photos from profiles, point histories, and area checks, with clear progress, original downloads, resilient retries, and filename-only case references.

## Read first

- [Frontend architecture](../architecture/frontend.md), including library boundaries, editor ownership, and JSON/persistence flows.
- [Execution guide](README.md), [F11](F11-photo-storage.md), and [F12](F12-image-processing.md).
- [Photo behavior](../mvp/issues/07-photo-assets.md), [profile-photo requirements](../mvp/issues/02-animal-profile.md), and [JSON photo references](../mvp/issues/06-json-contract.md).

## Scope

1. Add multiple-file selection with a limited-concurrency per-file upload queue, per-file progress, errors, and retry. Preserve form text independently of upload state; add no product count/size caps.
2. Bind each upload result to its original case and parent-record identity. If the user changes cases or removes the parent while it runs, do not attach the result to another record. Successfully stored unlinked files remain assets under the existing retention rule.
3. Attach only successfully stored original filenames to `photos`. Update asset metadata for pending/ready/failed derivatives without discarding saved originals or overwriting newer case edits.
4. Provide thumbnail browsing, full-resolution still viewing, original download, processing warnings/retry, and filename placeholders for unavailable assets. Avoid frame browsing or animation-player scope.
5. Support profile main-photo selection and captions. Add photos to history entries and area checks without duplicating their event data.
6. Unlink photos locally without deleting server files. Refresh/import should resolve filenames against the current server and preserve missing references.

## Acceptance criteria

- Photos can be attached to the profile, each relevant point-entry type, and area checks; caption and main-photo choices survive transfer.
- Entry text remains intact after upload failures. A saved original remains attached even if its preview fails.
- Older JSON exports still resolve unlinked server files. Missing assets display a usable placeholder without invalidating the case.
- A late upload result never lands in the wrong case or parent entry.
- JSON contains original filenames and metadata, not image bytes, device paths, or full server URLs.

## Validation

Exercise mixed successful/failed uploads, derivative retry, parent deletion or case replacement during upload, main-photo/caption changes, unlinking, reload, and import on the same server. Check hashes through original download and verify a missing-file fixture stays exportable. First-stage acceptance does not require a phone-camera setup.

## Architecture integration

Photo-reference changes use the owning editor lifecycle and commit through the root service. Upload completion alone does not mutate an unrelated or superseded editor. Cancelling references must not delete originals retained on the server.

## Completion notes

Implemented a shared photo gallery in the profile, all four point-history entry forms and area-check forms, with thumbnail browsing, a keyboard-accessible Material preview dialog, full-resolution viewing and original downloads. Profile captions and the main-photo choice use the existing Signal Forms editor. Thumbnail and full-preview errors are independent; preview failure preserves the thumbnail and available original download. Missing metadata hides download actions. Missing files retain their filename and a retryable placeholder; unlinking clears the profile's related main/caption selection without deleting server files or retained asset metadata.

`PhotoTransfers` owns a two-request concurrent queue, individual progress, upload failures and per-file retry. Only validated successful responses produce original filenames. The current case ID, local generation and editor ID are captured for each batch; `withPhotoEditing` merges successful attachments into that editor's current draft. Explicit Save publishes references through the existing root editor command. Cancel, parent removal, closing an editor or replacing the case prevents late attachment. Closing the gallery or destroying the route store cancels active/queued uploads and releases their callbacks. The queue uses the store owner's DestroyRef, not the root service's lifetime, for batch cancellation. Files published before cancellation remain retained server assets. A successful response that cannot be validated is shown as unconfirmed; when a safe original filename is known, retry only fetches metadata. Unknown outcomes without a safe filename cannot automatically re-upload. Visible text explains that unfinished uploads will not attach after the editor closes.

`PhotoServer` resolves metadata from the current server and polls only while derivatives are pending. `withPhotoProcessing` owns this I/O through NgRx event handlers, triggered by case restoration/replacement, attachment, editor commitment and explicit user retries. Results are correlated by case generation and request and remain in transient read state. Reads never mutate the document or draft, increase revision or trigger autosave. Explicit profile/history/check Save merges the latest resolved metadata into the complete candidate before validation and atomic commitment, avoiding asynchronous draft/version races. Photo cards only read state and dispatch explicit user intents; rendering a card cannot trigger a metadata read, revision change or autosave. Retry status and errors are derived from the workflow's transient request state, without a manual view subscription. Failed processing preserves the saved original and exposes processing retry. Transient processing states remain outside JSON v1; nullable derivative filenames represent the latest resolved availability. Server-local derivative basenames are mapped to globally unique logical filenames (`<original>.thumbnail.png` and `<original>.preview.png`); retrieval uses the original filename and the established `/thumbnail` and `/preview` routes. JSON contains filenames/metadata, never bytes, device paths or full URLs.

Focused verification observed the initial missing CaseStore photo command, missing upload-queue module and missing browser upload input before implementation. Store regressions cover explicit commitment, stale editor rejection, all four history types, check geometry preservation, metadata merges, unlinking and valid JSON. Browser scenarios exercise real PNG upload/download byte equality, thumbnails, viewing, main/captions, refresh, unlinking and older-export import, unsupported uploads, mixed failures/retry, controlled HEIC derivative failure/retry, missing references and late completion after case replacement. Native Linux HEIC decoding remains the verified F12 runtime; controlled HEIC browser responses test the F13 interface rather than re-proving codec support. Phone-camera setup is outside first-stage acceptance.

### Standards review

Independent review of tracked and untracked changes against user-confirmed `6193abc`: 0 actionable findings. Reducers retain case ownership, rendering uses `computed`/`linkedSignal`, and queue/HTTP operations remain in focused modules.

### Spec review

Independent review found one medium-severity viewing defect: a link promising a full-resolution browser view used the original-download route, which sends `Content-Disposition: attachment`. The viewer now loads full-quality image bytes inside the dialog and offers a 1:1 size toggle with scrolling, alongside a separate original-download action. A 1600×1200 PNG regression first failed on the missing 1:1 action; it now checks the actual displayed and natural image width rather than treating visibility of a downscaled image as detail inspection.

The first complete browser run passed 75/77 scenarios and caught a real profile-layout regression: gallery content squeezed existing profile groups and blocked incident controls. Moving the gallery into the scrolling section alone did not fix it. A targeted geometry probe measured seven grid rows at `0px` while the gallery consumed `469.75px`; explicitly preserving content-sized rows made the unchanged incident-edit scenario pass. The gallery now belongs to the common scrolling section with `grid-auto-rows: max-content`; Save/Cancel remain in the fixed footer. Temporary probes were removed, and existing incident-edit regressions retain their original assertions.

### Final validation — 2026-10-29

- `npm exec nx run-many -- -t typecheck lint test build --output-style=static` exercised the complete workspace. Static checks, builds and all browser/domain unit suites passed; the API suite initially failed its address-cache cases because the required local Redis service was stopped. After `docker compose up -d redis`, `npm exec nx run api:test -- --output-style=static` passed all 60 API tests. No API code changed. Redis was stopped again after acceptance.
- After the viewer/layout corrections, `npm exec nx run-many -- -t typecheck lint build -p workspace web web-e2e --output-style=static` passed all seven selected targets. The workspace unit/integration suite passed all 53 tests, including four new photo-seam regressions.
- The final `npm exec nx run web-e2e:e2e -- --workers=2 --retries=0 --output-style=static` passed all **77** Chromium scenarios without retries. These include all six new F13 browser scenarios, original incident-edit regressions and the 1600×1200 image's actual 1:1 width. The desktop profile screenshot was inspected.
- Formatting and whitespace checks passed. Changes remain uncommitted on `feat/f13-photo-interface`; HEAD remains the user-confirmed `6193abc`. No push or PR was created.

### Review follow-up — declarative presentation and case-owned metadata

The subsequent review identified a documentation omission and three improvement opportunities. The workspace README now lists `photos.spec.ts`. `failedImage` declares its thumbnail URL, preview URL and request identity through an explicit `linkedSignal` source. `PhotoCard` no longer owns a metadata resource, dispatches metadata results or subscribes to a retry mutation. `withPhotoProcessing` owns the HTTP workflow through named NgRx events/handlers; reducers own the transient request state and metadata merges. Read/processing retries are explicit intents; retry progress/errors derive from that state rather than view-owned flags. Case replacement cancels old requests and clears transient results. Merely mounting a card performs no metadata request or document write.

Three regressions in `photo-workflow.spec.ts` cover metadata resolution without a card, rendering without a new request/revision, image-error reset, duplicate retry prevention, retry failure/recovery, cancellation on case replacement and exclusion of request state from JSON. The frontend typecheck/lint/test/build targets passed, including 56 workspace tests and the application test. The full 77-scenario Chromium suite passed with two workers and zero retries, using an isolated Playwright configuration on ports 3101/4301 because the user's existing application occupied the standard port. Existing application processes were left running. No commit was created.

### Second review follow-up — read isolation, upload outcomes and ownership

All seven reported cases received regressions. The restoration test now captures the document, exported data, revision and storage writes **before** the first metadata response; a legacy case without assets stays unchanged after successful resolution. Metadata no longer writes to any draft, so an in-flight Save can use the latest read cache without invalidating or overwriting its editor session. Upload tests distinguish a failed write from an unconfirmed successful response, verify confirmation by GET without another POST, and cancel active/queued jobs when their owner is destroyed. A separate injector test destroys the actual CaseStore without gallery cleanup. Rendering tests separate preview/thumbnail failures, remove unusable download actions and reject stale gallery editor identities. Browser acceptance also checks the confirmation action and canceled-upload request.

Final follow-up verification: the frontend typecheck/lint/test/build targets passed, including all 63 workspace tests and the application test. The full Chromium suite passed all **78** scenarios with two workers and zero retries, using the isolated configuration on ports 3101/4301. Original JSON references remain unchanged by resolution; only explicit Save commits metadata. Changes remain uncommitted.
