# Constraints for map services and hosting

Parent: ../map.md
Label: wayfinder:grilling
Type: grilling
Status: resolved
Assignee: macsy
Blocked by: 04

## Question

Context: [Map use in the field and on desktop](04-map-capabilities.md) and [Animal profile and escape circumstances](02-animal-profile.md).

What constraints should guide the selection of MVP services and infrastructure? Define expected geographic coverage, approximate user and photo counts, allowable monthly cost, willingness to use paid services and provider accounts, and any hosting preferences. Context: the application needs a street map, satellite or aerial imagery, address search, and server photo storage, but no authentication or case database in the MVP. After resolution, create precise research into providers and possible architecture; do not ask the user for facts that can be checked in service documentation.

## Answer

- Run the MVP locally through Docker. Publishing at a public address is a later stage.
- First-version coverage: Poland only. This clarification replaces the earlier suggestion that Poland would merely be the priority.
- Personal use and possibly a few testers. This is a scale assumption, not a product limit on entries or photos.
- Only free services for now. Do not assume authorization for a paid plan or adding a payment card. The user's existing computer and internet connection are not new application services.
- The user suggested OpenStreetMap as a starting point. Suitability of specific tile and geocoding servers and additional imagery requires research into service terms; do not assume OSM automatically satisfies every requirement.
- Retain the agreed photo requirements: persistent server files, originals and thumbnails, and no product-level limits. The Docker variant must address persistence between runs and phone access to the application.
- Do not implement, publish, or purchase services in this planning session. Further commits are prohibited.

Research: [Technical feasibility of maps and photo storage](09-technical-feasibility.md). It should cover OSM, free Polish orthophoto sources, and local Docker architecture. Any mismatch requiring a compromise returns as a user decision.
