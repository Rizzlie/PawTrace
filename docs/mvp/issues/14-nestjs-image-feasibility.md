# NestJS image-processing and workspace feasibility

Parent: ../map.md
Label: wayfinder:research
Type: research
Status: resolved
Assignee: macsy
Blocked by: none

## Question

Which documented NestJS/Node image-processing setup satisfies the existing photo requirements in Linux Docker: JPEG/PNG/WebP/HEIC input, unmodified received originals, thumbnails, compatible full-resolution HEIC previews, streaming uploads, no product-level count/size limits, and retaining successful originals when derivative generation fails? Verify realistic codecs/binaries, memory/process-isolation considerations, and Nx Angular/NestJS workspace integration through primary sources. Distinguish a pure Node/TypeScript option from any genuinely necessary native dependency or separate worker. PostgreSQL/PostGIS are future plans, not MVP requirements. Do not implement or select user trade-offs without discussion.

## Comments

The user selected NestJS to align with their Angular experience; the earlier Python/FastAPI architecture is superseded. Preserve Docker, local `data/assets`, browser-side case persistence, filenames in JSON, and all photo decisions. The user prohibits new commits, branches, pushes, PRs, and implementation. Research output only: `../research/nestjs-image-feasibility.md`.

Active T3 task: `node:delegated-task:command%3Amcp%3A62624c61-c925-4ae4-a971-a52ff7bec9d9%3Adelegate-task%3Apawtrace-nestjs-heic-research-20261026-round1`. Do not duplicate while it is running. The subagent writes only its research note; the parent reviews and resolves the ticket.

## Answer

The delegated research completed and the parent reviewed [NestJS image and Nx workspace feasibility](../research/nestjs-image-feasibility.md). This note is the primary home for technical findings, sources, implementation checks, and unverified claims. No implementation or Git operations were performed.

The documented recommended route is NestJS Express with disk-streamed originals and a separate Node image-processing process using Sharp with a custom Linux libvips/libheif/HEVC decoder. This keeps application code in Node/TypeScript without a Python service. Exact container/dependency pins, real HEIC decoding, memory behavior, and failure isolation still require integration tests; documentation is not a completed build.

The research identifies a WASM conversion alternative and its precision/coverage uncertainties. It does not introduce product file limits, mandatory Redis/database infrastructure, or different original-retention rules. Image presentation for multi-image/animated files and derivative color/bit-depth expectations remain interview branches in [MVP simplifications and remaining domain boundaries](13-plan-refinement.md), rather than decisions made by the researcher.
