# F11 — Persistent original-photo storage

Status: done
Depends on: F01, F04, F10

## Goal

Provide real NestJS asset storage that preserves uploaded originals and stable filename references across container recreation, independently of image-derivative processing.

## Read first

- [Frontend architecture](../architecture/frontend.md), including library boundaries, editor ownership, and JSON/persistence flows.
- [Execution guide](README.md), [F01](F01-workspace-and-docker.md), and [F04](F04-domain-and-json-contract.md).
- [Photo behavior](../mvp/issues/07-photo-assets.md) and [current backend boundaries](../mvp/issues/10-local-architecture.md).
- [NestJS upload/persistence research](../mvp/research/nestjs-image-feasibility.md), including its verification limits.

## Scope

1. Add Express-compatible NestJS upload handling that streams files to disk rather than retaining whole uploads in the API heap. Accept the agreed JPEG/PNG/WebP/HEIC formats with actual-content checks, separating original-storage errors from later decoding failures.
2. Stage each original under a unique reserved name, complete storage before publishing its filename, and preserve the file-part bytes received from the browser. Use safe filename-based lookup and stream original downloads.
3. Bind-mount host `data/assets`, with persistent metadata for original/derivative identity and processing state. This is asset state, not a case database. Derivatives are implemented by F12.
4. Return stable original filenames and metadata for F13. Handle failed/disconnected uploads and retry without overwriting unrelated files or publishing nonexistent originals.
5. Keep asset retrieval and missing-file responses usable after container replacement. Unlinking/removing case records never deletes server files.

## Acceptance criteria

- Uploading a supported original and downloading it yields identical bytes to the browser-supplied file.
- Two uploads with the same original client filename cannot overwrite each other.
- Restarting/recreating the container with the same mount retains originals and their stable filenames.
- A failed original write returns a per-file error and no successful reference; later derivative failure does not invalidate a stored original.
- The deployed request path introduces no arbitrary product photo-count or MB cap. Actual disk, timeout, and parser constraints are documented and surfaced as failures rather than advertised as unlimited hardware.

## Validation

Use real uploads/downloads and hash comparison, name collisions, interrupted writes, controlled disk/write failures, missing files, and container recreation. Inspect body/parser/proxy limits for the actual deployment. Verify no case database, authentication, cleanup daemon, or whole-case synchronization has been introduced.

## Architecture integration

Keep server assets/upload implementation under API boundaries. Shared case schemas remain framework-neutral; uploaded assets do not create server-side case persistence or automatic browser synchronization.

## Completion notes

Implemented `POST /api/assets` (one multipart `file` per request), `GET /api/assets/:filename/metadata` and streaming `GET /api/assets/:filename` original downloads. HTTP controllers, multipart coordination, filesystem storage and metadata/format recognition live in separate files under `apps/api/src/app/assets`. The external interface owns the complete upload lifecycle; callers never coordinate temporary files or publication.

Multer 2.5.0 streams into an exclusively reserved UUID directory inside `ASSET_DIRECTORY`. The original write is flushed before format recognition through file-type 22.2.0. Browser MIME/extension do not establish format. JPEG, PNG/APNG, WebP and HEIC/HEIF still/sequence signatures normalize to original filenames; this is content recognition, not decoder validation. Recognizable but undecodable originals remain successful attachments for F12. AVIF, GIF, text and unrecognized content are not accepted as the four supported formats.

Original bytes are never transformed. Metadata is flushed to a temporary file and renamed to `metadata.json` only after the complete multipart request has succeeded. Only that final marker publishes the original. Each asset directory is exclusively reserved, so repeated client filenames and UUID collisions cannot overwrite existing assets. Abort, parser and original-write failures discard unpublished files. A hard process kill may leave an unpublished directory, which remains unavailable; no cleanup daemon is introduced. File flushes and publication do not promise power-loss durability across every host filesystem.

Metadata retains original identity, byte size, nullable dimensions/derivative names, and independent pending/ready/failed derivative states. F11 initially leaves thumbnails pending and HEIC previews pending; compatible-format previews are not required. There is no processor or processing-retry endpoint until F12, and no photo editing UI until F13. Missing originals return 404; corrupt/unreadable metadata returns 503. Original-write failures return 507 with a retryable per-file error and an OS error code, without a successful filename. Case records and shared JSON schemas remain unchanged.

Validation completed on 2026-10-28:

- HTTP TDD: the initial upload test failed with 404 before implementation. All 23 asset scenarios now pass, including real JPEG/WebP/HEIC hashes, PNG bytes, name collisions, content spoofing, unknown/unsafe lookups, malformed and interrupted multipart requests, original-write failure/retry, application recreation, derivative-failure independence, a 21 MiB original and preservation of the primary error when cleanup also fails.
- API typechecking, lint and production build passed during implementation.
- Built the actual Node 24.16.0 Linux production image (`docker build --tag pawtrace:f11 .`). `ASSET_TEST_IMAGE=pawtrace:f11 npm exec nx run api:verify-assets -- --output-style=static` passed real JPEG/PNG/WebP/HEIC SHA-256 round-trips, a 32 MiB upload, container replacement with the same host bind mount, read-only EROFS, and real ENOSPC on a 1 MiB tmpfs. Failed writes published no filename; an upload after disk-full cleanup succeeded and health/download endpoints remained usable.
- `npm exec nx run-many -- -t typecheck lint test build --output-style=static` passed all 24 targets across eight projects and 262 unit/integration tests. After the review correction, `npm exec nx run-many -- -t typecheck lint test build -p api --output-style=static` passed again, including 54 API tests (23 asset scenarios), bringing the workspace total to 263 tests.
- `npm exec nx run web-e2e:e2e -- --workers=2 --output-style=static` passed all 71 Chromium scenarios with the standard development servers. No frontend behavior or case contract changed.
- `npm exec nx run api:verify-assets -- --output-style=static` rebuilt the final production image and repeated all Docker acceptance checks successfully after the review correction.

### Standards review

Independent review of tracked and untracked changes against user-confirmed `f95474b9db39de83fe74d66873df04a401598ae4` found no actionable documented-standard violations or baseline code smells. HTTP coordination, original storage and metadata responsibilities stay in focused files; no hypothetical storage port or case persistence was added.

### Spec review

The independent spec review found one low-severity failure-path issue: a cleanup failure could hide the primary original-write error behind HTTP 500. Cleanup is now best effort with a sanitized server warning; the primary per-file error and OS code survive. The HTTP regression first reproduced 500, then passed with the expected retryable 507/ENOSPC even when cleanup encounters EROFS. No successful filename is published. No other missing requirements, incorrect F11 behavior or scope creep were identified.

### Additional production UI check

An extra 71-scenario browser run against the Docker production image passed 70 scenarios and exposed an existing deployment gap: a direct request to `/profile` returns 404 because static serving lacks an SPA fallback, whereas in-app navigation works. The static serving implementation was unchanged by F11. This remains a frontend/deployment acceptance follow-up for F15; the standard browser suite and F11 production asset checks pass. No test assertion was weakened.

`npm exec nx run api:verify-assets` builds the current production image and repeats the Docker acceptance checks. It uses isolated temporary containers/directories, leaves the running Compose deployment alone, and cleans up its own resources. Set `ASSET_TEST_IMAGE` only to verify an explicitly prebuilt image.

The production route has no application reverse proxy: Docker forwards port 3000 directly to Nest/Express. Multipart uploads bypass Express's JSON/urlencoded body parsers. No file-byte or case-photo-count limit is configured; the endpoint accepts one independent file per request and rejects text fields. Multer/Busboy retain parser/header constraints (including a 16 KiB multipart-part header and 2,000 header-pair parser bound), and Node retains its default 300-second whole-request and 60-second header receive timeouts. Dev `/api/**` forwarding adds no configured body-size or proxy timeout. Host disk/inodes, permissions, filesystem maximums, network interruptions, server timeouts and finite container resources can still fail a file; these are infrastructure constraints, not product MB/count rules. No claim of unlimited hardware is made.
