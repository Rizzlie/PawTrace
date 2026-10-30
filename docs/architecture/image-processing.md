# Photo processing

F12 extends the original-photo module; browser case JSON continues to reference only the immutable original filename. Photo attachment controls belong to F13. P03 makes every photo private to one case and owner; see the [P03 decision record](../post-mvp/tasks/P03-private-case-photos.md).

## Interface and module depth

The external seam is HTTP: upload one original, read metadata, download the original or a derivative, and retry processing. The module hides filesystem publication, codec selection, process lifecycle, queue admission, atomic state changes and restart recovery. Callers never coordinate temporary paths or a queue. Tests cross this same seam, with a second deployment seam at the actual Docker image.

`PhotoRepository` owns the owner → case → stored photo relation in PostgreSQL. `OriginalAssets` owns the internal storage protocol. `ImageProcessing` owns admission and processing state. `PhotoCleanup` owns removal. Native Sharp imports exist only in the short-lived `assets/image-worker.mjs` process. There is one implementation of storage and one native decoder; no speculative codec abstraction is introduced.

## HTTP contract

Every route requires a session, and mutating routes require the CSRF token and origin. A route first resolves the owner, the case and the filename together in PostgreSQL, before it touches the filesystem. Without a session the answer is 401. A foreign case, an absent case and an absent filename all return the same 404 `{ "error": "not_found" }`. The former global `/api/assets/**` URLs stay closed: 401 without a session and 404 with one. They do not extend the session. Responses are `no-store`.

- `POST /api/cases/:caseId/assets`: saves the original before returning its filename and pending derivative states. Ownership is checked before the body is read. Conversion failures do not turn a successful upload into a failed original.
- `GET /api/cases/:caseId/assets/:filename/metadata`: returns current original metadata and independent `processing.thumbnail` / `processing.preview` states. Dimensions describe the oriented full image. Metadata is never cached.
- `GET /api/cases/:caseId/assets/:filename`: downloads the exact received original bytes.
- `GET /api/cases/:caseId/assets/:filename/thumbnail`: streams an inline PNG, fitted inside 480 × 480 pixels without enlargement, retaining alpha.
- `GET /api/cases/:caseId/assets/:filename/preview`: streams an inline, full-resolution PNG for HEIC, without resizing. Other formats use `not_required` and their original for full viewing.
- `POST /api/cases/:caseId/assets/:filename/retry`: returns metadata and queues failed derivatives against the same original. Pending and ready outputs are retained. If a derivative has failed while another is still active, return an explicit 409 busy response; retry after that processing attempt ends. Concurrent retries are idempotent within the supported single application instance.

Derivative names in metadata are relative to their original's storage directory, e.g. `thumbnail.png` / `preview.png`; fetch them through the original's HTTP routes above. Pending, failed, not-required and missing derivatives return 404; inspect metadata to distinguish their states. Unknown/unsafe original names return 404. Metadata/storage-read failure and retry-write failure return 503. The existing original-write 507 contract is unchanged. A database failure while recording an upload returns a retryable 503 `photo_publication_failed`.

Failed derivatives carry one of `decoder_failed`, `decoder_resource_limit`, `derivative_write_failed`, `worker_exited` or `processing_timeout`. A dead worker does not establish the cause of death: `worker_exited` may include an OS resource kill. These states let F13 display a warning and retry action without removing a successful attachment.

## Ownership and storage layout

`stored_photo` is the only link from a case to bytes. It holds a server-generated storage UUID, the owning case and the logical filename, which is unique within that case only. Only an upload writes it (P08 will add archive restoration). A case document, a `photo_reference` or a `photo_asset` row never creates or claims one, so a JSON filename that matches a foreign original resolves to nothing.

- `ASSET_DIRECTORY/objects/<storage id>/`: published photos, each with `original`, `metadata.json` and any `thumbnail.png` / `preview.png`. The logical filename does not appear on disk.
- `ASSET_DIRECTORY/staging/<uuid>/`: uploads in progress. Nothing reads it over HTTP and it is removed at every application start.
- Anything else in the directory, such as MVP `<uuid>/` folders, is ignored: not served, processed, claimed or deleted.

An upload streams into staging, detects the format and writes its record there. It then commits the `stored_photo` row, atomically renames the directory into `objects/` and confirms the row still exists. A failed rename deletes the row. If the process dies between the commit and the rename, the row names no file and no client ever learned its filename. If the case was deleted during the upload, the file is removed and the caller gets 404.

Unlinking, cancelling an editor and replacing a case's content remove no file: an uploaded photo stays case-owned, so an older export of the same case can still resolve it. A case deletion writes its storage ids to the `photo_removal` outbox in the same transaction. The files are removed after the commit, and at the next start if that fails. Published directories are never compared with the database, so a restored or empty database cannot read as permission to erase originals.

## Durable queue and publication

Published `metadata.json` records in `objects/` are the queue. One async directory scan runs at a time, at one-second intervals, with at most one asset and one child decoder admitted. The scan streams directory entries instead of building a queue proportional to the photo count. A missing root is normal before the first upload. Staged uploads and malformed records are ignored; malformed metadata remains explicitly unavailable over HTTP.

The worker reads the saved original path and writes `thumbnail.part.png` or `preview.part.png`. Only after a clean worker exit does the parent atomically rename that output, then flush and replace metadata through `processing-metadata.part`. HTTP serves only a derivative marked ready. On restart, pending records are scanned again and old partial output is replaced. Completed derivatives are not automatically reprocessed; failed ones require explicit retry. A graceful shutdown kills the active child and retains pending state. Abrupt container replacement is recoverable from the same asset mount.

This is a single application-instance filesystem queue. Do not run multiple PawTrace processes against one asset directory. There is no distributed lock, Redis photo queue or cleanup daemon. Disk-wide metadata-write failures cannot durably record a new failed status; the last published state remains and pending work is revisited after storage recovers. Atomic replacement does not promise survival of every host power loss. Back up the entire asset directory, including metadata, together with PostgreSQL while uploads and processing are stopped: either half alone loses the link between cases and files.

## Native runtime and resources

The Linux image builds Sharp **0.35.5** against libvips **8.18.7**, libheif **1.23.7**, and libde265 **1.1.3**, on Node **24.16.0** / Debian bookworm. Native release archives are SHA-256 pinned in the Dockerfile. libde265 is linked into libheif rather than discovered as an optional runtime plugin. No HEVC encoder or WASM replacement is used. Custom library/tool licences are included under `/opt/codecs/licenses`.

The worker selects the HEIF primary image by leaving page selection implicit, applies orientation, explicitly transforms embedded ICC profiles to sRGB and outputs PNG. The conversion includes an output ICC transform: changing libvips' colourspace alone does not correctly transform 10-bit P3 working pixels. Original bytes remain the fidelity guarantee. PNG previews are compatible SDR views, not a promise of original bit depth, embedded metadata, wide-gamut/HDR identity or gain-map rendering. One still primary image suffices for compound/animated input.

Admission is one derivative at a time; Sharp's operation cache is disabled and native thread concurrency is one. Each child has a 128 MiB V8 old-space budget, which **does not cap native allocation or total RSS**. `IMAGE_PROCESSING_TIMEOUT_MS` defaults to 60000 and accepts 1–600000 ms per derivative, including child startup; expiry kills that child and publishes a retryable processing failure. Sharp's default pixel/decoder safeguards remain enabled. These are processing constraints, not upload MB/count limits.

The worker shares the container's memory cgroup with the HTTP process. A separate Node process contains ordinary exceptions/native process exits; it cannot guarantee that the OS will spare the HTTP process during cgroup or host OOM. In the actual 192 MiB tests, one run spared HTTP while killing decoders; the final run killed the entire API container. Both recovered originals and processing after replacement with normal resources. The 48 MP fixture used about 304000 KiB peak worker RSS. Use measured deployment memory and preserve the asset mount across recovery.

## Verification

`npm exec -- nx run api:test -- src/image-processing.spec.ts` exercises the owned HTTP interface with PostgreSQL, real storage and actual child decoding; `src/case-photos.spec.ts` covers isolation, attachment locations and injected failures. `npm exec -- nx run api:verify-images` builds the production image, starts it beside a disposable PostGIS container with a seeded session (the image has no test login), and tests the deployed codec path, SHA-256 original preservation, expected full-preview dimensions, thumbnails, corrupt input, partial write failure/retry, worker SIGKILL, container replacement during processing, deadline failure and actual memory-cgroup exhaustion/recovery. `ASSET_TEST_IMAGE` selects an explicitly prebuilt image; `KEEP_ASSET_EVIDENCE=1` retains PNG evidence under `.scratch` for visual inspection. Ordinary Compose data and running containers are untouched.

Fixtures and their independent expected dimensions/hashes are documented in [the fixture catalogue](../../apps/api/tests/fixtures/README.md). Synthetic samples cover 8-/10-bit, all eight orientations, non-first primary selection, embedded thumbnails, alpha, ICC/PQ input and 12/48 MP grids. Real phone-specific gain maps and arbitrary camera profiles are not exhaustively covered. Full-resolution dimensions and visual inspection are both required; a codec capability flag alone does not establish HEIC support.

Primary implementation references: [Sharp custom libvips builds](https://sharp.pixelplumbing.com/install/), [Sharp primary-image selection](https://github.com/lovell/sharp/blob/v0.35.5/src/common.cc), [libheif codecs/build](https://github.com/strukturag/libheif/tree/v1.23.7), and [libvips HEIF loader](https://github.com/libvips/libvips/blob/v8.18.7/libvips/foreign/heifload.c).
