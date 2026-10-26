# PawTrace — first-version decision map

Label: wayfinder:map
Status: open

## Destination

Define the specification for the first useful version of PawTrace: a web application for desktop and phone that records information about an animal disappearance on a map and saves one case in one JSON file. The map is complete when no decisions remain that are required before implementation can start.

## Notes

- Current user instruction: do not create any further commits for now, including prototype and research commits. This overrides the skills' archiving requirements. The earlier local prototype commit `995e04d` on `prototype/pawtrace-ui` remains unchanged; it has not been merged into `main`.
- Current user priority: finish the desktop browser version first; refine phone support later, without making phone testing or HTTPS configuration a prerequisite for the first stage.
- The user's explicit technology selection: Nx + Angular + Leaflet. This replaces the React/Vite/OpenLayers proposal. The user ruled out GUGiK and chose OSM as the basic basemap and Mapbox for satellite imagery; trial details and sources are in the provider ticket.
- During further plan refinement, the user selected NestJS for the backend and PostgreSQL/PostGIS as a future post-MVP direction. This replaces Python/FastAPI; image-processing feasibility is being rechecked. The user explicitly keeps food-check links, report deduplication, structured search-thoroughness fields, and multi-tab protection outside the MVP.

- Mode: planning. This map does not include application implementation.
- Initial assumptions confirmed by the user: the application runs in a browser on desktop and phone; the first version handles one case in one file; a database is planned for later.
- Agreed annotation types: escape location, animal observations, potential hiding places, and areas of planned and completed searches. Observations record event time, source, and confidence in identification. Searched areas record the search time and result.
- The profile supports any species. It covers appearance, age, health, temperament, reactions to people and animals, and familiarity with the area. Escape circumstances are recorded too. Values may remain unknown.
- JSON must preserve context for later analysis outside the application. AI analysis is not part of this version.
- Each session uses the wayfinder, grilling, and domain-modeling skills; prototype tickets also use the prototype skill.
- Tracker: local Markdown following `C:/Users/macsy/.agents/skills/setup-matt-pocock-skills/issue-tracker-local.md`. Child tickets are in `issues/`. Open tickets have `Status: open`, claimed tickets `Status: claimed`, and completed tickets `Status: resolved`. Dependencies use `Blocked by:`. The frontier consists of open, unclaimed tickets whose dependencies are resolved, ordered by ticket number.
- Resolve no more than one ticket per session, except research tickets. The session that charts the map resolves no tickets manually.

## Decisions so far

- [Case lifecycle and safe file saving](issues/01-case-files.md): local restoration, full-JSON transfer, warnings before replacement, and recovery from failed automatic saves; no file merging or MVP tab lock.
- [Animal profile and escape circumstances](issues/02-animal-profile.md): optional profile and incident description; server-hosted photos in the MVP, with filenames in an observation's `photos`.
- [Meaning of map points and areas](issues/03-map-records.md): named points with multiple roles and history entries; observation rejection status; areas and histories of actual checks.
- [Map use in the field and on desktop](issues/04-map-capabilities.md): two basemaps, search and location on demand, measurements, filters, and full mobile editing; online MVP.
- [Server photo handling](issues/07-photo-assets.md): no product-level limits; originals and thumbnails, unique filenames, unlinking without deleting files, and resilience to photo errors.
- [Interface layout and map workflow](issues/05-map-workflow.md): accepted green design with floating panels, point positioning, newest-first history, and filtering and deletion rules.
- [JSON contract for case transfer and later analysis](issues/06-json-contract.md): a versioned complete case with point histories, structured details, explicit time uncertainty, and safe import; map view stored separately.
- [Constraints for map services and hosting](issues/08-service-constraints.md): local Docker deployment, Poland only, personal use and a few testers; free services, with OSM proposed for verification.
- [Technical feasibility of maps and photo storage](issues/09-technical-feasibility.md): a documented route to a free MVP; findings identify concrete architecture trade-offs.
- [Local MVP architecture and technical trade-offs](issues/10-local-architecture.md): local Docker deployment, Nx/Angular/Leaflet with NestJS after the user's corrections, and persistent assets; PostgreSQL/PostGIS later.
- [Choosing satellite tiles for Leaflet](issues/12-satellite-provider.md): OSM and Mapbox `satellite-streets-v12` through Static Tiles API in a card-free trial; no authorization for a paid plan.
- [MVP readiness and first-release boundaries](issues/11-mvp-readiness.md): accepted work sequence, acceptance scenario, and desktop-version boundaries; plan ready for handoff.
- [NestJS image-processing and workspace feasibility](issues/14-nestjs-image-feasibility.md): a documented Node/NestJS route without Python, with native-codec and container checks still required during implementation.
- [MVP simplifications and remaining domain boundaries](issues/13-plan-refinement.md): predefined place types, three identification outcomes with visible different-animal sightings, filter-aware counts, resilient saving, and minimal image presentation.
- [Frontend technology and browser persistence feasibility](issues/16-frontend-technology-feasibility.md): verified Angular/Zod/IndexedDB/Leaflet mechanics and caveats for the ongoing frontend architecture interview.

- [Frontend architecture](../architecture/frontend.md): agreed one-root state, Signal Forms editor projection, web/API/shared Nx boundaries, Leaflet adapter, and strict JSON/persistence flows; final confirmation pending.
- [Signal Forms binding feasibility](issues/17-signal-forms-state-binding.md): researched public writable projection API with selected-package and integration verification still required.

## Not yet specified

The frontend architecture interview has settled Q1–Q23. The consolidated architecture and updated F-series tasks await final overall confirmation; implementation has not started.

## Out of scope

- AI analysis, route prediction, automatically suggested search locations, and LLM provider integrations — deferred by the user.
- A database and a catalog of multiple cases — a future stage; currently one case in one file.
- Authentication and automatic cross-device synchronization — a later stage confirmed during the case-saving discussion.
- Restricting photo access to the signed-in user — a later stage identified during the profile and photo discussion.
- Full offline mode, continuous location tracking, and walking-route calculation — outside the agreed MVP map features.
- Automatic removal of unused server photo files — outside the MVP, to avoid breaking references in older JSON exports.
- Access to the local installation over mobile data, VPN configuration, and public hosting — outside the first local MVP.
- GUGiK orthophoto integration — ruled out by the user in favor of satellite tiles from another provider.
- Refining and accepting the phone version — after the desktop version is ready.
- Implementing, publishing, and operating the application — this map leads to a specification.
- Explicit links between food checks and placements, observation deduplication/same-event grouping, extra structured search-thoroughness fields, and browser-tab edit locks — deliberately omitted from the MVP during refinement.
- User-defined place roles, a separate case-closing workflow, frame browsing, and animation playback — outside the MVP after the refinement interview.
