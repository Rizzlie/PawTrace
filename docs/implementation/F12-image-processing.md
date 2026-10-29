# F12 — Image processing and HEIC previews

Status: done
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

Validation completed on 2026-10-28:

- HTTP TDD: the first thumbnail test failed before implementation. Six integration scenarios now cover asynchronous generation, original preservation, corruption/retry, completed-output retention, restart, unavailable filenames and derivative-write recovery. Tests cross the agreed HTTP seam, not private methods.
- `npm exec -- nx run-many -t typecheck lint test build --output-style=static` passed for all eight projects, including all 269 unit/integration tests. `CI=true NX_DAEMON=false npm exec -- nx run web-e2e:e2e --workers=1 --retries=0 --output-style=static` passed all 71 browser scenarios without retries. API typecheck/lint and all 60 backend tests passed again after the review and colour fixes; installed commit hooks ran normally.
- Built the actual Linux amd64 production image with `docker build --tag pawtrace:f12 .`. `ASSET_TEST_IMAGE=pawtrace:f12 npm exec -- nx run api:verify-assets --output-style=static` passed F11 original hashes, container replacement, read-only EROFS, real ENOSPC and recovery.
- `ASSET_TEST_IMAGE=pawtrace:f12 KEEP_ASSET_EVIDENCE=1 npm exec -- nx run api:verify-images --output-style=static` passed the final deployed image. Real JPEG/PNG/WebP/HEIC plus sixteen independent CC0 HEIC charts pass processing, expected full dimensions and original SHA-256 checks. Coverage includes 8-/10-bit, all eight orientations, primary image 3 of 4, embedded thumbnail, alpha, ICC/PQ input and 12/48 MP grids. Visual inspection confirms upright/unmirrored charts, the correct primary image and fine full-resolution detail rather than an enlarged thumbnail.
- Forced corruption, derivative-write failure, active-processing retry, native worker SIGKILL, interrupted-container recovery and deadline failure/recovery all passed. Actual 192 MiB cgroup OOM was exercised: one run killed only decoders and spared HTTP; the final run killed the API container too. Both recovered the unchanged original and completed pending/failed processing with normal resources. The 48 MP worker reached about 304000 KiB peak RSS. Separate processes do not guarantee API survival within a shared memory cgroup.

Independent review against user-confirmed `07173d3`: Standards — 0 findings. Spec — 1 retry finding, fixed. A regression first reproduced silent HTTP 201 while a failed thumbnail's preview was active; it now observes explicit HTTP 409 and successful retry after processing ends. Additional visual QA found incorrect 10-bit P3 conversion: its known sRGB-red patch first produced `[234, 51, 34]`; an explicit output ICC transform now produces `[255, 0, 0]`, checked through the deployed preview.

Remaining limits: no promise of identical HDR/gain-map rendering or exhaustive camera-profile support; no host power-loss guarantee; one application instance per asset directory. The asset mount and complete metadata must survive replacement. Photo attachment/viewing controls remain F13. Runtime constraints and repeatable verification are documented in the linked module guide.

### CI follow-up — browser interaction setup

The first GitHub Quality run passed the other 24 tasks but failed the keyboard location-tooltip scenario and reported a flaky phone-toolbar scenario. Linux Chromium reproduced the failures that the original Windows run missed. Traces showed correct keyboard focus and tooltip text while pointer hover interfered with the initial overlay. The location test now parks the pointer on the neutral map before testing keyboard focus.

The phone scenario could focus the location button before automatic geolocation started after case restoration. A check for an enabled button alone could therefore pass too early, with the subsequent request disabling that button during keyboard navigation. The test now uses a controlled delayed permission denial and waits for its visible result before focusing the ready toolbar. Existing tooltip, accessible-description, arrow-navigation and canvas-size assertions remain intact; no retry or timeout increase was introduced.

Validation on 2026-10-29: the two scenarios passed 20 repeated Linux runs with two workers and zero retries; the full Linux Chromium suite passed all 71 scenarios with two workers and zero retries. `web-e2e:typecheck` and `web-e2e:lint` also passed. Temporary focus/tooltip instrumentation was removed before these final checks. Only browser-test setup and this acceptance record changed; application code and dependencies are unchanged.
