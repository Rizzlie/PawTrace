# F12 — Image processing and HEIC previews

Status: planned
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

To be filled during implementation.
