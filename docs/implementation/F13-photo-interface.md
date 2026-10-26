# F13 — Photo attachments and viewing

Status: planned
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

To be filled during implementation.
