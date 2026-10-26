# NestJS image and Nx workspace feasibility

Research date: 2026-10-26. Documentation/source investigation only; no dependencies installed, code implemented, containers built or run, or integration tests performed.

## Recommendation and confidence

**Recommended viable route, subject to a container integration test:** Nx with Angular + Leaflet and a NestJS Express API; disk-streamed original uploads into bind-mounted `data/assets`; a bounded processing queue feeding a separate Node process using Sharp linked to a custom Linux libvips with libheif + an HEVC decoder such as libde265. Generate thumbnails for the four required input formats and a full-resolution PNG HEIC preview. Preserve every successfully stored original independently of derivative status. No Python service, HEIC encoder, database, ORM, or distributed queue is necessary for this route.

The image pipeline is Node/TypeScript application code **with native libraries**, not pure TypeScript. A separate processing process is a resilience recommendation, not a NestJS requirement. Node supports separate Node processes through [`child_process.fork`](https://nodejs.org/api/child_process.html#child_processforkmodulepath-args-options).

**Known:** the components expose the required APIs and documented codec integration. **Not confirmed:** a particular pinned Linux image and dependency set successfully decoding PawTrace's real HEIC samples. Documentation establishes feasibility, not a completed HEIC acceptance test.

## Existing decisions preserved

Scope comes from [14](../issues/14-nestjs-image-feasibility.md), [07](../issues/07-photo-assets.md), [10](../issues/10-local-architecture.md), and [06](../issues/06-json-contract.md). NestJS supersedes prior Python/FastAPI backend research. Case persistence/export/import remains browser-side. The server stores assets by unique filenames; `photos` references original filenames without URLs or embedded image data. Original/thumbnail/preview relationships belong to asset metadata. Unlinking does not delete originals; missing files do not invalidate a case.

There is no product photo-count or individual-file MB cap. A saved original is a successful attachment even when thumbnail/preview generation fails: retain the reference, expose original download, warning, and processing retry. An upload that did not save an original must not produce a successful reference. Full-resolution HEIC preview and original download are already required; identical HDR appearance is already excluded from the promise. PostgreSQL/PostGIS are after MVP.

## Upload and persistence route

**Known:** Nest's built-in multipart integration uses Multer with Express; it is not the Fastify upload integration. Its memory-storage default buffers entire files, while `diskStorage` streams file content to disk. `StreamableFile` accepts a readable stream for downloads. Use disk storage and `createReadStream` for originals, rather than a `Buffer`-based upload/download path. These are separate directions of streaming. [Nest upload/streaming documentation](https://docs.nestjs.com/techniques/file-upload).

**Known:** Multer documents `fileSize`, `files`, and `parts` defaults as `Infinity`. Non-file field/header limits also exist; these are not photo-size limits. Its custom storage API receives each file's stream. Do not copy tutorial `maxCount` or MB examples into the product. [Multer storage and limits](https://github.com/expressjs/multer#storage).

**Recommended design, inferred from these APIs:** select many files in the UI and upload them through a limited-concurrency per-file queue. A per-request file endpoint does not limit the number attached to a case. It makes success/retry independent across files and avoids one failed multipart batch obscuring earlier saved files. Keep case text independently saved in the browser.

1. Stream each file part to a uniquely reserved temporary file under the asset mount. Do not resize, rotate, recompress, or remove metadata on this path. Store exactly the file-part bytes received from the browser, excluding the multipart envelope. This cannot promise recovery of bytes the browser/device converted before sending.
2. Finish storage and its chosen durability procedure before publishing the original filename. Use server-generated names, no overwrite, and safe lookup rather than treating an uploaded filename as a filesystem path. Incomplete/disconnected uploads stay unsuccessful and must not become published originals.
3. Publish the saved original independently; mark each derivative pending/ready/failed. Run conversion from the saved file path, write derivative temporary files, and publish only completed outputs. A conversion exception or worker exit must never delete or roll back the original.
4. Recover pending work after restart from small filesystem status records or a scan; this is asset processing state, not a case database. Retry processing against the same original filename, preserving old JSON references. These are implementation recommendations, not existing code.

Node's [`stream.pipeline`](https://nodejs.org/api/stream.html#streampipelinesource-transforms-destination-callback) provides stream completion/error handling and flow control. Streaming transport does not imply constant-memory decoding. Validate actual file content rather than trusting the extension/MIME header, and keep derivative errors separate from original write errors.

**Infrastructure constraints to expose and test:** free disk/inodes, permissions, interrupted writes, host filesystem behavior, request/proxy timeouts, and process/container memory. Node documents a default whole-request receive timeout of 300 seconds; slow large uploads therefore need deliberate transport configuration and testing. Do not present a timeout or disk-full failure as an invented product size rule. [Node HTTP `requestTimeout`](https://nodejs.org/api/http.html#serverrequesttimeout). No finite machine can promise every arbitrary file will upload or decode successfully.

## Sharp, libvips, and Linux HEIC

**Known:** Sharp's standard prebuilt format list includes JPEG, PNG, WebP, and AVIF, but does not include HEIC. AVIF availability does not prove HEVC decoding. Sharp documents a global custom libvips path discovered through `pkg-config --modversion vips-cpp`, a minimum version in its package metadata, and a source-build route requiring C++17/node-gyp tooling. Installing an OS codec beside the bundled libvips does not establish that Sharp uses it. [Sharp installation](https://sharp.pixelplumbing.com/install/).

**Known:** libvips supports HEIC when built with libheif, which itself needs the appropriate codecs. Its README demonstrates decoder enumeration. Sharp's source explicitly maps the HEIF file/buffer loader and handles the primary HEIF image. [libvips dependencies](https://github.com/libvips/libvips#libheif), [Sharp loader source](https://github.com/lovell/sharp/blob/main/src/common.cc).

**Known:** libheif's usual HEIC decoder is libde265; x265 is an encoder. HEIC input converted to PNG/JPEG does not require HEIC encoding. libheif supports built-in codec linkage or dynamically loaded plugins, with `LIBHEIF_PLUGIN_PATH` controlling discovery. Its CMake documentation provides codec selection. The broad Sharp HEIC-output instructions mentioning x265 should not be mistaken for a decoder-only requirement. [libheif build/codec documentation](https://github.com/strukturag/libheif#compiling), [Sharp HEIF output](https://sharp.pixelplumbing.com/api-output/#heif).

**Concrete build plan for later implementation, not executed:**

- Prefer a glibc Debian-based Node Linux image. Pin a mutually compatible Node/Nx/Nest/Sharp set and native-library releases, with a patch-update process.
- Use development headers plus an HEVC decoder. Debian provides [`libheif-dev`](https://packages.debian.org/trixie/libheif-dev) and [`libheif-plugin-libde265`](https://packages.debian.org/trixie/libheif-plugin-libde265); runtime plugin availability must be verified, not inferred from headers.
- Build libvips against libheif and JPEG/PNG/WebP dependencies using the documented Meson/Ninja path. Inspect the configure summary to ensure the loaders are enabled. If distro libheif is unsuitable, build libde265 first, then libheif with CMake and its decoder enabled, before libvips. [libvips source-build procedure](https://www.libvips.org/install.html#building-libvips-from-source), [libheif build procedure](https://github.com/strukturag/libheif#compiling).
- Build Sharp against that global libvips and carry the matching shared libraries, loader configuration, and codec plugins into the runtime stage. Keep Sharp external to the Nx backend bundle as its installation documentation requires. Do not copy Windows native modules into Linux.

The version issue is real: inspected Sharp `0.35.5` metadata requires libvips `>=8.18.7`, whereas Debian trixie's inspected `libvips-dev` page lists `8.16.1`. Thus simply installing that distro package does **not** satisfy this Sharp version. A custom newer libvips build is the concrete recommended path; a deliberately older compatible Sharp set would need separate verification. [Sharp package metadata](https://github.com/lovell/sharp/blob/main/package.json), [Debian libvips development package](https://packages.debian.org/trixie/libvips-dev).

## Derivative fidelity and decoder constraints

**Recommended:** thumbnail JPEG/PNG/WebP with documented dimensions chosen during implementation; full-resolution HEIC preview as PNG, with no downscale. PNG avoids introducing lossy JPEG compression into detail inspection and can preserve alpha. It increases storage/transfer cost; no numerical cap or thumbnail dimension is selected here. Original download remains the fidelity guarantee. Sharp provides these output encoders, ICC transformation, and metadata controls. [Sharp output API](https://sharp.pixelplumbing.com/api-output/).

**Known:** libvips HEIF loading has greater-than-8-bit paths; its implementation uses 16-bit storage for higher-bit-depth input. That establishes a native route for high-bit-depth data, not proof of correct HDR presentation. [HEIF loader source](https://github.com/libvips/libvips/blob/master/libvips/foreign/heifload.c). Test 8-bit and 10-bit HEIC, orientation/mirroring, alpha, ICC/NCLX color, grid images, and representative phone HDR/gain-map samples. Explicitly check dimensions after orientation and visible detail; a full-resolution preview is not necessarily bit-depth-, metadata-, or HDR-equivalent to the original.

**Known technical limits, not new product rules:** Sharp documents default `limitInputPixels: 268402689` and a removable channel limit. `unlimited` removes certain decoder safeguards; it does not grant infinite memory. libvips documents a HEIF dimension guard of 16384 by 16384, increasing to 65535 by 65535 with `unlimited`. libheif additionally exposes image/tile/item/memory-block security limits. [Sharp constructor](https://sharp.pixelplumbing.com/api-constructor/), [libvips HEIF API](https://www.libvips.org/API/current/ctor.Image.heifload.html), [libheif security API](https://github.com/strukturag/libheif/blob/master/libheif/api/libheif/heif_security.h).

Do not silently use these as upload rejection thresholds or indiscriminately disable them. Recommended handling: keep the saved original; report the exact processing constraint; permit retry after a supported configuration/version change. Verify pinned versions because guards and APIs vary. Guaranteed previews for arbitrary dimensions cannot be confirmed.

**Memory and isolation:** Sharp's cache control bounds its operation cache, not total RSS; its concurrency setting controls libvips threads per image, not the number of admitted jobs. Use an explicit job queue. [Sharp cache/concurrency](https://sharp.pixelplumbing.com/api-utility/). An 8-bit RGBA raster alone needs width × height × 4 bytes; decoder surfaces, encoded data, and output buffers add memory. Passing a path avoids keeping the compressed upload in the API's heap, but does not eliminate decoded-image allocation.

Node worker-thread `resourceLimits` exclude external allocations such as ArrayBuffers and do not prevent process-wide out-of-memory aborts. Prefer a separate Node process for native decode failures; a separately constrained worker container is stronger isolation if OOM testing requires it. A process within the API's memory cgroup alone does not guarantee API survival. [Node worker limits](https://nodejs.org/api/worker_threads.html), [Docker memory/OOM behavior](https://docs.docker.com/engine/containers/resource_constraints/). No worker memory budget, job timeout, or concurrency number is selected without measurement.

## One Node-only deployment alternative

**Viable candidate:** `libheif-js` WASM decoding inside Node, then raw pixels into Sharp for thumbnails/PNG preview. This removes the custom native HEIC linkage while retaining ordinary Sharp for JPEG/PNG/WebP. It still uses a compiled libheif codec, not a decoder authored purely in TypeScript. The package documents Node WASM and bundled-WASM variants, whole-buffer decode, image dimensions, and RGBA display output. [libheif-js documentation](https://github.com/catdad-experiments/libheif-js).

The closely related `heic-decode` implementation currently imports `libheif-js/wasm-bundle`; its source accepts HEIF/HEIC major brands `mif1`, `msf1`, `heic`, `heix`, `hevc`, and `hevx`, then exposes `Uint8ClampedArray(width*height*4)`. Thus the exposed RGBA output is concretely **8 bits per channel**, not preserved 10/12/16-bit samples. Brand recognition alone does not prove all streams using those brands decode. [WASM entry point](https://github.com/catdad-experiments/heic-decode/blob/master/index.js), [format/output implementation](https://github.com/catdad-experiments/heic-decode/blob/master/lib.js).

`heic-convert` provides JPEG/PNG output through pure-JavaScript encoders and warns that substantial work remains synchronous despite its Promise API. Its high-level conversion can use the first image or iterate images. [Converter documentation](https://github.com/catdad-experiments/heic-convert). For PawTrace, direct WASM-to-raw-to-Sharp avoids an unnecessary encode/decode cycle. A worker process remains appropriate; upload streaming still ends at disk before whole-buffer WASM processing.

**Not confirmed:** a published exhaustive input bit-depth/profile matrix for the shipped WASM binary, reliable 10/12-bit/HDR conversion, primary-image selection versus first-image ordering in all files, or peak memory/performance for large photos. The 8-bit output API proves a precision limitation; it does not prove 10-bit input rejection. This alternative is plausible for compatible previews but should not displace the native recommendation before representative fixtures pass. Do not claim that the Sharp WASM package itself supplies HEIC support.

## Nx boundaries and future PostGIS

**Known:** official Nx plugins support Angular and Nest applications/libraries in one workspace. The Nest generator documents a `frontendProject` API proxy option. Match `@nx/angular` and `@nx/nest` versions to `nx`; select framework/Node versions from their supported matrices rather than blindly combining latest releases. The inspected Nest plugin page lists Nest 10/11 support while current Nest web docs include newer-version details; basic Multer/disk streaming remains the relevant route, and exact version behavior needs checking. [Nx Angular](https://nx.dev/docs/technologies/angular/introduction), [Nx Nest](https://nx.dev/docs/technologies/node/nest/introduction).

**Recommended boundary:** framework-neutral shared TypeScript domain/contracts and runtime schema validation; Angular/Leaflet UI adapters on the browser side; Nest transport DTOs and asset services on the server side; Sharp/filesystem/native dependencies confined to server/worker projects. Do not make shared case data depend on Angular, Nest decorators, Node filesystem types, or future persistence entities. Nx can enforce dependency direction through tags and import-boundary lint rules. [Nx boundaries](https://nx.dev/docs/features/enforce-module-boundaries). Shared TypeScript interfaces alone do not validate imported JSON; Nest also documents that interfaces lack runtime metadata for `ValidationPipe`. [Nest validation](https://docs.nestjs.com/techniques/validation).

Future PostgreSQL/PostGIS is compatible with this boundary without choosing an ORM now. Preserve stable IDs, schema version, explicit latitude/longitude, circle center/radius in meters, polygon vertices, and actual historical geometries. A later adapter can create GeoJSON geometry fragments using longitude-first coordinate arrays: [RFC 7946](https://www.rfc-editor.org/rfc/rfc7946). PostGIS accepts geometry fragments through `ST_GeomFromGeoJSON` and defaults to SRID 4326; it does not accept the entire case document as geometry. [PostGIS import](https://postgis.net/docs/ST_GeomFromGeoJSON.html). Keep circle center/radius as domain facts; a later geography buffer can derive a polygon using meters, whereas geometry buffer distance uses SRID units. [PostGIS buffer](https://postgis.net/docs/ST_Buffer.html). No database, migrations, synchronization, or persistence schema is selected here.

## Required implementation evidence

These are technical acceptance checks, not unresolved product decisions:

- In the actual pinned Linux runtime, record Sharp/libvips versions and enabled loaders; enumerate the HEVC decoder and decode real HEIC. A `heif` capability flag alone can also reflect AVIF support, so it is insufficient.
- Exercise JPEG/PNG/WebP and 8-/10-bit HEIC; compare source/received/downloaded-original hashes and preview dimensions. Test HEIF primary-image ordering, orientation, grid layout, alpha, and color against representative device files.
- Verify slow and large uploads, many sequential attachments, bounded concurrent uploads/decodes, peak RSS, disk use, and restart persistence. Inspect every proxy/body/parser timeout and cap in the deployed route.
- Force interrupted upload, disk-full/original-write failure, corrupt image, decoder guard failure, derivative-write failure, worker kill, and OOM. Confirm no fictional original reference, surviving saved originals, explicit warning, and functional processing retry.
- Verify restart recovery and JSON+assets restore on another device. Do not make a database or Redis a prerequisite for a local filesystem queue.

## Unresolved product decisions only

No new product choice blocks investigation of the recommended stack. Two presentation details remain unspecified if such files are encountered: whether animated WebP/multi-image HEIC should expose multiple frames/images beyond a single preview, and the intended derivative color/bit-depth policy within the already accepted non-identical-HDR promise. PNG is the technical recommendation, not a recorded user selection. Neither question authorizes rejecting otherwise saved originals.

## What could not be confirmed

No build or target-device tests were authorized. Consequently the exact working dependency pins, runtime codec discovery, complete HEIC profile coverage, HDR rendering, peak resource requirements, power-loss durability, and OOM isolation remain unverified. The Node/WASM alternative lacks an exhaustive documented input bit-depth matrix in the inspected sources. There is no evidence supporting a promise of successful derivative generation for every size/profile, and no product count/MB limit is introduced to conceal that uncertainty.
