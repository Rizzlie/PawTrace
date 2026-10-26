# F11 — Persistent original-photo storage

Status: planned
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

To be filled during implementation.
