# Local MVP architecture and technical trade-offs

Parent: ../map.md
Label: wayfinder:grilling
Type: grilling
Status: resolved
Assignee: macsy
Blocked by: 09

## Question

Context: [Technical feasibility of maps and photo storage](09-technical-feasibility.md), [research note](../research/technical-feasibility.md), [Constraints for map services and hosting](08-service-constraints.md).

Which architecture option do we choose based on the research, and what product behavior applies to the edge cases it exposed? Decide phone access from LAN only or also in the field, acceptance of local HTTPS and device certificate trust, informed use of public OSM/Nominatim under their policies, a compatible full-resolution HEIC preview, photo status after successful original storage but failed thumbnail creation, and a persistent asset directory and data-copying method. Choose a coherent stack and Docker startup approach without implementation, paid services, authentication, a case database, or commits. Documentation alone is not an integration test.

## Answer

### User selections

- Phone access initially from the same LAN; local HTTPS with certificate trust is accepted. The user emphasized not spending too much attention on phones at this stage. Implementation priority: desktop; retain a responsive interface and make phone HTTPS configuration an optional local-testing variant. Do not require certificate installation for ordinary desktop use. Mobile-data access and VPN are outside the MVP.
- Public OSM and Nominatim accepted after their terms were presented. Retain attribution, cache, application identification, and configurable sources. Search only after submission, without autocomplete; a shared queue allows at most one Nominatim request per second. No bulk map downloads or promised availability. Sources and constraints are in the [research](../research/technical-feasibility.md).
- The interface must switch between both basemaps: basic OSM street mapping and Mapbox `satellite-streets-v12` imagery. The user's later correction excludes GUGiK. Details of the accepted card-free trial and Static Tiles API are in [Choosing satellite tiles for Leaflet](12-satellite-provider.md); this does not authorize paid usage or adding a card.
- For HEIC, create a full-resolution browser-compatible preview in addition to the unchanged original received from the browser and a thumbnail. The original remains downloadable. The preview is a derivative; identical HDR rendering across browsers is not promised.
- A correctly and persistently saved original is a successful attachment even if thumbnail/preview creation fails. Show a warning, original download, and retry-processing action. Failure to save the original still must not add a nonexistent file to `photos`.
- A persistent host directory, `data/assets`, is bind-mounted into the container. Restarting or replacing the container does not delete photos. A case backup includes JSON and assets; JSON alone does not copy images. Unlinking photos does not delete files.

### Selected technical option for implementation

Technical selection based on the research and the choices above:

- Frontend: an Nx workspace, Angular, and TypeScript; Leaflet for mapping, following the user's later explicit choice. This replaces the earlier React/Vite/OpenLayers proposal. Rebuild the interface from the accepted prototype direction without promoting demonstration code to production. Use the free Leaflet drawing/editing route documented in the map-library research; verify exact library versions and Angular integration during implementation rather than treating them as an unresolved product choice.
- Local backend: NestJS/TypeScript, following the user's plan-refinement preference and Angular experience. This supersedes the Python/FastAPI proposal. NestJS handles asset APIs and address-search proxying. The completed NestJS feasibility research documents a Node/native-codec HEIC path, with pinned-container integration tests still required. Do not carry Pillow/Pillow-Heif into the final stack. No case database or authentication in the MVP.
- Docker Compose: Linux containers; build the frontend into static files served by the application server. A basic desktop setup; optional Caddy local HTTPS for phone testing on the LAN, with persistent certificate state.
- Basemaps through Leaflet tile layers: OSM and Mapbox Static Tiles API, without GUGiK integration. Nominatim search through a local endpoint, shared queue, and cache, without sending case-history text as address queries.
- Streaming uploads, a limited-concurrency file queue, and separation of derivative generation from original storage. Do not introduce product-level photo-count or file-size limits. Resource errors concern individual photos and do not destroy entry text.
- JSON and automatic saving remain browser-side. A shared photo server does not synchronize cases between devices; case transfer still uses JSON export/import.

No container build, service integration, or target-phone testing has been performed. Required implementation checks and readiness criteria are refined in [MVP readiness and first-release boundaries](11-mvp-readiness.md). No commits were created.

### Later priority correction

The user decided to refine phone support after the desktop browser version is ready. Local HTTPS configuration and testing on physical phones do not block the first stage. Preserve the ability to adapt the interface later; do not deploy additional phone infrastructure now.

### Backend direction clarified during plan refinement

The user prefers NestJS because Angular is their main skill. PostgreSQL and PostGIS are the intended future persistence direction, after the file-based MVP. This is not authorization to add a database, ORM, migrations, sockets, or synchronization now. Future concurrency behavior remains a later discussion. Verify the NestJS/HEIC route in [NestJS image-processing and workspace feasibility](14-nestjs-image-feasibility.md) before choosing the image-processing implementation.

### Refined implementation boundaries

- Keep browser UI and Leaflet dependencies in the Angular application, HTTP and filesystem concerns in the NestJS application, and case data plus runtime import validation in framework-neutral shared TypeScript libraries. Shared types alone do not validate imported JSON.
- Use NestJS Express with disk-streamed uploads and streaming original downloads. Keep native image dependencies server-side, with bounded processing in a separate Node process so derivative generation is separate from original storage. The documented baseline is Sharp with a custom Linux libvips/libheif/HEVC decoder; pin and test the actual image before claiming HEIC acceptance.
- Generate a single still primary-image preview. A full-resolution compatible PNG preview is the technical baseline for HEIC detail viewing; preserve orientation and test color handling. Original download remains the fidelity reference; identical HDR/bit-depth rendering is not promised by the preview requirement.
- Use filesystem asset-processing state and retry/recovery without requiring a case database, Redis, or a distributed job system. Preserve the existing separation between server assets and browser-owned case persistence.
- Keep the future PostgreSQL/PostGIS integration behind a later persistence boundary. Do not build database entities into the JSON/domain model or preimplement synchronization. The rationale is recorded in [Use NestJS alongside Angular in the Nx workspace](../../adr/0001-use-nestjs-in-the-nx-workspace.md).
