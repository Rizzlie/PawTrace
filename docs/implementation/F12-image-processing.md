# F12 — Image processing and HEIC previews

Status: in_progress — implementation verified; final deployment validation and independent review in progress
Depends on: F11

## Goal

Build and prove the actual Linux image-processing path: thumbnails for the supported photo formats and a full-resolution compatible HEIC preview, with originals surviving every derivative failure.

## Read first

- [Frontend architecture](../architecture/frontend.md), including library boundaries, editor ownership, and JSON/persistence flows.
- [Execution guide](README.md) and [F11](F11-photo-storage.md).
- [Photo decision](../mvp/issues/07-photo-assets.md), [backend architecture](../mvp/issues/10-local-architecture.md), and [NestJS ADR](../adr/0001-use-nestjs-in-the-nx-workspace.md).
- [NestJS image feasibility](../mvp/research/nestjs-image-feasibility.md), particularly native-codec builds, derivative fidelity, resource limits, and required implementation evidence.

## Scope

1. Pin and build a compatible Node/Sharp/libvips/libheif/HEVC-decoder set in the actual Linux Docker image. Verify decoding, not merely an advertised HEIF/AVIF capability flag. Keep the ordinary NestJS API separate from native processing concerns.
2. Process a bounded queue through a separate Node processing process. Read saved originals, write derivatives through temporary outputs, and expose explicit pending/ready/failed states. Avoid adding Redis or a distributed queue to the local MVP.
3. Generate thumbnails and a full-resolution compatible PNG HEIC preview with correct primary-image selection and orientation. For compound/animated files, one still primary image is sufficient. Preserve original bytes and original downloads.
4. Record derivative filenames in asset metadata. Support retry against the same original and recovery of pending work after restart without changing JSON photo references.
5. Surface decoder, memory, timeout, and output-write failures per derivative. Preserve successful originals and keep the API usable; assess real isolation behavior instead of claiming a separate process guarantees survival of every container OOM.

## Acceptance criteria

- Representative JPEG/PNG/WebP and real HEIC files produce the required derivatives in the built runtime.
- The HEIC full preview retains the oriented image dimensions, rather than enlarging a thumbnail. Identical HDR rendering is not a promise.
- Decoder/derivative failure retains the original reference, download, clear warning, and retry capability.
- Restart recovery resumes or exposes pending work without corrupting completed assets.
- The deployed codec versions and actual verification evidence are documented. A WASM fallback or changed fidelity requirement is not silently substituted for a failing selected path.

## Validation

Use legitimate representative fixtures, including 8-/10-bit HEIC where available, orientation cases, and multi-image primary selection. Compare original hashes and preview dimensions; inspect visible detail. Force corrupt decode, derivative-write failure, worker exit, and controlled resource failure. Record peak-resource observations and any unverified format coverage; documentation alone is insufficient completion evidence.

## Architecture integration

Keep native image processing behind API/worker boundaries. Derivative progress and failures are service results, not a second authoritative case state. Follow the existing original-preservation requirements.

## Completion notes

Implemented the [photo-processing module](../architecture/image-processing.md): a disk-backed queue, one separate native decoder process at a time, 480-pixel PNG thumbnails, oriented full-resolution HEIC PNG previews, HTTP derivative downloads and per-derivative retry. Original filenames/bytes and browser case JSON are unchanged. Pending work recovers after restart; failed derivatives retain a warning state and the successful original.

The production Linux image pins Node 24.16.0, Sharp 0.35.5, libvips 8.18.7, libheif 1.23.7 and libde265 1.1.3. Native archives are SHA-256 checked; the decoder is actually linked and exercised. Tests use the public HTTP interface and the deployed image, as agreed with the user.

Validation so far: six new HTTP integration scenarios, all 269 workspace unit/integration tests, typechecking/lint/build for all eight projects, and the F11 production original-storage suite passed. Real JPEG/PNG/WebP/HEIC plus sixteen independent CC0 HEIC charts pass deployed processing, expected dimensions and original hashes. Visual inspection confirms all eight orientations, primary image 3 of 4 and fine full-resolution detail rather than an enlarged embedded thumbnail. Decoder corruption, derivative-write failure/retry, native SIGKILL, interrupted-container recovery and deadline failure/recovery passed. The final native validation run also exercises actual cgroup OOM and recovery; its evidence and the independent review will be recorded before completion.
