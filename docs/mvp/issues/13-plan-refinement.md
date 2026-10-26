# MVP simplifications and remaining domain boundaries

Parent: ../map.md
Label: wayfinder:grilling
Type: grilling
Status: resolved
Assignee: macsy
Blocked by: none

## Question

Which refinements improve the agreed plan without adding unnecessary MVP complexity? Review history semantics, repeated reports, search records, save failures, workspace/backend boundaries, point-role vocabulary, and what happens after the animal is found. Preserve earlier decisions unless the user explicitly changes them. Discuss unresolved branches with the user; do not answer on their behalf.

## Comments

The user rejected explicit food-check/placement links, same-event grouping of observations, new structured search-thoroughness fields, and multi-tab edit protection for the MVP. They accepted resilient save-failure behavior and selected NestJS as the backend direction, with PostgreSQL/PostGIS planned after the MVP. These clarifications are recorded in their owning tickets: [Case lifecycle and safe file saving](01-case-files.md), [Meaning of map points and areas](03-map-records.md), [JSON contract for case transfer and later analysis](06-json-contract.md), and [Local MVP architecture and technical trade-offs](10-local-architecture.md).

Do not reintroduce the rejected mechanisms as prerequisite implementation work. Future sockets/concurrency are undecided, not selected architecture. Technical facts about NestJS image processing are being checked separately.

Pending interview branches: standard versus custom point roles, minimal case-completion behavior, and any product compromises exposed by the NestJS research. No new implementation or commits.

The user accepted recording recovery as a check result while keeping the case editable, without a separate closing workflow; the owning case-lifecycle ticket was updated. They asked whether point roles mean place types such as escape location, feeding location, or a place where the animal was seen. This vocabulary/behavior distinction is still being clarified, not yet resolved. The NestJS research has completed and awaits parent review; do not rerun it.

The parent reviewed and resolved the NestJS feasibility research. Additional pending presentation details exposed by it: one primary still preview versus multiple images/frames for compound/animated files, and derivative fidelity expectations within the already accepted preservation of originals. Do not reopen previously rejected scope expansions.

The user declined custom place types for now: the MVP uses predefined point roles. For an animal-seen report, the user explicitly requires whether it is the searched-for animal, a different animal, or uncertain. The owning map/JSON tickets and glossary now reflect this three-way assessment in place of the earlier four-level confidence proposal. This applies to individual observations, not the entire point. Still to clarify: the map summary when identification outcomes differ within one point, and whether identifying a different animal automatically rejects the report or remains a separate finding.

The user subsequently required different-animal observations to remain visible on the map with a distinguishable presentation, rather than being excluded from the default search view. They accepted point-level counts of confirmed, uncertain, and excluded observations. The map/interface/JSON tickets were updated accordingly; identification is not automatically mapped to manual rejection. Remaining interview details include how active filters affect counts and the minimal presentation of compound/animated image files.

## Answer

The refinement interview is complete. The user confirmed that point counts follow active filters while the opened point retains its full history, and that one still primary-image preview is sufficient for compound/animated inputs, alongside thumbnails, full-resolution viewing, and the unchanged downloadable original.

The canonical decisions are recorded in their owning tickets rather than duplicated here:

- [Case lifecycle and safe file saving](01-case-files.md): preserve work and allow export after automatic-save failure; no MVP multi-tab lock; recovery does not close or lock the case.
- [Meaning of map points and areas](03-map-records.md): predefined place roles, separate observation records, no extra food-event links or structured search-thoroughness fields, and three animal-identification outcomes with visible different-animal sightings.
- [Interface layout and map workflow](05-map-workflow.md): per-outcome point counts based on active filters, with complete contextual history when opened.
- [JSON contract for case transfer and later analysis](06-json-contract.md): preserve individual observations and their identification assessments; derive point counts rather than storing competing facts.
- [Server photo handling](07-photo-assets.md): one still primary-image preview for compound/animated files, preserving original download and existing full-resolution requirements.
- [Local MVP architecture and technical trade-offs](10-local-architecture.md): Nx/Angular/Leaflet/NestJS, server-side image-processing boundary, and future PostgreSQL/PostGIS without adding persistence or sockets to the MVP.
- [MVP readiness and first-release boundaries](11-mvp-readiness.md): concrete checks covering the clarified behavior and the untested NestJS/HEIC integration.

The [NestJS architecture ADR](../../adr/0001-use-nestjs-in-the-nx-workspace.md) records the user's maintenance rationale and the image-processing trade-off. [NestJS image-processing and workspace feasibility](14-nestjs-image-feasibility.md) records the factual investigation and its limits. No unresolved interview branches remain from this round. No implementation or commits were performed.
