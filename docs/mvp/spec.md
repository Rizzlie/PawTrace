# PawTrace — MVP plan

Status: product and frontend architecture decisions agreed; final architecture-plan confirmation pending; implementation has not started.

PawTrace is an application for managing an animal disappearance case: a map of named places with histories, an animal profile, search areas, photos, and JSON case export and restoration. The first stage runs locally through Docker and targets a desktop browser.

This file is the entry point to the agreed specification. Detailed decisions have a single source in the linked tickets. The [decision map](map.md) indexes the entire planning process.

For implementation instructions such as `F01`, use the [F01–F15 task index](../implementation/README.md). These execution documents implement the decisions below; they do not replace the decision tickets or authorize starting code as part of documentation work.

## Read before implementation

1. [MVP readiness and first-release boundaries](issues/11-mvp-readiness.md) — the accepted work sequence, complete acceptance scenario, validation, and scope of the first stage.
2. [Local MVP architecture and technical trade-offs](issues/10-local-architecture.md) — the current Nx + Angular + Leaflet + NestJS stack, local photo server, and Docker. Includes the user's later corrections.
3. [Choosing satellite tiles for Leaflet](issues/12-satellite-provider.md) — OSM and Mapbox Static Tiles, the card-free trial, and configuration constraints.
4. [JSON contract for case transfer and later analysis](issues/06-json-contract.md) — structure, identifiers, time, geometry, photos, and import.
5. [MVP simplifications and remaining domain boundaries](issues/13-plan-refinement.md) — the completed refinement round, deliberate scope reductions, observation identification, filtering semantics, and save-failure behavior.
6. [NestJS architecture decision](../adr/0001-use-nestjs-in-the-nx-workspace.md) — why the local API uses NestJS alongside Angular, with PostgreSQL/PostGIS deferred.

7. [Frontend architecture](../architecture/frontend.md) — agreed state, forms, Nx boundaries, map integration, JSON pipeline, and persistence verification.

## Application behavior

- [Case lifecycle and safe file saving](issues/01-case-files.md).
- [Animal profile and escape circumstances](issues/02-animal-profile.md).
- [Meaning of map points and areas](issues/03-map-records.md).
- [Map use in the field and on desktop](issues/04-map-capabilities.md) — the original requirements; a later decision defers phone acceptance and replaces the satellite source.
- [Interface layout and map workflow](issues/05-map-workflow.md).
- [Server photo handling](issues/07-photo-assets.md).
- [Domain glossary](../../GLOSSARY.md).

## Reference material

- [Accepted visual direction and point-positioning interaction](prototypes/pawtrace-floating-prototype.html). A standalone HTML file with in-memory data only; it is not product code. The interface ticket records the archival branch. It predates the refined observation-assessment and counting rules; use the current decision tickets for those behaviors.
- [Original layout variants](prototypes/pawtrace-ui-prototype.html).
- [Technical research with sources](research/technical-feasibility.md). This is research material, not the current stack selection: its React/OpenLayers and GUGiK recommendations were superseded by later architecture and provider decisions.
- [NestJS image and workspace research](research/nestjs-image-feasibility.md). The current backend feasibility investigation, with native-codec constraints and required integration evidence; it supersedes the earlier Python recommendation.

## Conditions for starting work

- This plan does not authorize publication, purchasing services, or starting implementation in this session.
- The user's instruction remains in effect: **do not create any new commits for now**.
- A Mapbox account and token will be needed when configuring the integration; neither has been connected yet. Do not request the token in ordinary chat — use the private secret-entry mechanism when needed.
- Initial integration checks cover real tiles, geocoding, HEIC derivative generation, and asset persistence. The existing research and prototype are not evidence of a working finished application.

The original product planning and first refinement are complete. The user has requested [frontend architecture refinement](issues/15-frontend-architecture.md) before implementation, supported by [targeted technology research](issues/16-frontend-technology-feasibility.md). These decisions will be reflected in the F-series tasks; the prohibition on new commits remains in effect.
