# PawTrace MVP — technical feasibility

Research date: 2026-10-26. Status: research for the parent's decision, no implementation. Read the `research` skill, ticket 09, `map.md`, and resolutions 04, 07, 08, and 06. The research is already being performed by a delegated subagent; no further delegation was made, as instructed by the user. No commits, branches, PRs, installations, or deployments were created. The only output file is this note.

## Conclusion and verification level

The MVP is technically feasible locally in Docker on Windows without a paid service or payment card: a browser application, local file/API server, persistent assets, OSM street mapping, and official GUGiK orthophotos. This does not guarantee public-service availability or the ability of a finite computer to process an arbitrarily large image. Documented facts, metadata-reading observations, and design proposals are distinguished below.

Confirmed through documentation: required geometry and measurement types, free Polish orthophotos, OSM/Nominatim constraints, the secure-context requirement for location, persistent volumes, and a Linux HEIC-decoding path. Not confirmed by testing: editing usability on target phones, complete GetMap/GetTile operation in the browser, building the selected container, the largest supported photo, or every HEIC variant. These tests were not performed during planning.

## 1. Street mapping: OSM data and a separate service

OSM data is licensed under ODbL. An interactive map needs visible `© OpenStreetMap contributors` attribution linking to the copyright/license page. Attribution must remain readable, including beneath floating phone panels. Share-alike obligations concern relevant derived OSM databases; displaying a basemap alone does not justify treating all application code or private observations as OSM data. The exact scope of any future distribution of a derived database is assessed separately. [OSM licensing and attribution](https://www.openstreetmap.org/copyright).

The public raster service `https://tile.openstreetmap.org/{z}/{x}/{y}.png` is a conditional candidate for a small online application. Its policy requires attribution, correct identification, a valid web `Referer`, and compliance with HTTP caching (at least seven days if the cache cannot read headers). A browser uses its own User-Agent; a server/proxy needs a recognizable application User-Agent, not an anonymous library identifier. Do not force `no-cache` by default, strip Referer, bulk-download regions, prepare offline maps, or prefetch beyond normal viewing. No guaranteed tile allowance is specified for PawTrace; access can be withdrawn without notice. OSMF generally discourages a custom tile proxy; if one is used, it must respect caching and identification and retain Referer. Simplest proposal: direct browser tiles and a configurable provider. **Free data does not mean unlimited free hosting.** [Binding tile policy](https://operations.osmfoundation.org/policies/tiles/).

This is not an orthophoto source. Basemap failure should leave case data and local annotations available. Self-rendering OSM is a possible later option that removes dependence on public hosting, but requires importing, storing, and maintaining data; it is unnecessary for the proposed MVP. No commercial alternative's free plan was researched or promised.

## 2. Addresses: public Nominatim only after an informed decision

**Read before selection: [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/).** The public server allows human-triggered search with a moderate number of users. The maximum is **one request per second for the entire application**, not per phone. It requires an identifying Referer or User-Agent, attribution, and the ability to switch services without an application update. Proxying and caching are recommended. Autocomplete, systematic result collection, detail scraping, and sending confidential/personal data are prohibited. Availability is not guaranteed. The current policy separately requires an informed choice and developer responsibility; it prohibits offering the public API as a generic geocoding service through no-code/low-code/vibe-coding platforms. This note therefore presents a candidate for an explicit decision by PawTrace's owner, not an automatically selected integration.

Proposed compliant integration: a text field and “Search”/Enter, a dedicated local endpoint, shared queue, persistent cache of repeated queries, PawTrace identification, and a configurable upstream; no requests while typing or automatic retry loops. Separate tester installations should not assume separate application allowances either.

Search endpoint: `https://nominatim.openstreetmap.org/search`, with parameters such as `q`, `format=jsonv2`, `countrycodes=pl`, and `accept-language=pl`. `countrycodes=pl` is a country filter; the language preference does not restrict coverage. Results reposition the map without creating points. Do not send animal-observation text as a query. [Official Search API](https://nominatim.org/release-docs/latest/api/Search/).

Manual map positioning is also needed for incomplete addresses or missing results. Lack of autocomplete does not reduce the agreed scope, which requires manual search. If the user rejects the public server's terms, another service or a self-hosted geocoder becomes a decision again; do not assume a paid replacement or remove search.

## 3. Polish orthophotos — GUGiK/Geoportal

### Official endpoints and data characteristics

GUGiK documents connecting WMS/WMTS to your own software without an API key. Standard orthophotos and high-resolution imagery are separate services. The data is free to download and use freely. It is historically captured imagery with location-dependent recency and resolution, not a live satellite view. WMTS uses prepared tiles; at very high zoom, WMS may reveal more detail. Do not promise a uniform date, resolution, or current terrain appearance. [Official ORTO description](https://www.geoportal.gov.pl/pl/dane/ortofotomapa-orto/), [service catalog](https://www.geoportal.gov.pl/pl/usluga/uslugi-przegladania-wms-i-wmts/).

Base endpoints, without guessing private APIs used by the Geoportal viewer:

- Standard WMS: `https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolution`
- Standard WMTS: `https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMTS/StandardResolution`
- High-resolution WMS: `https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/HighResolution`
- High-resolution WMTS: `https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMTS/HighResolution`
- Optional true-ortho WMS: `https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/TrueOrtho`

No sheets or tiles were downloaded for load testing.

### Reading official GetCapabilities on the research date

Several ordinary metadata reads were performed, without testing limits:

- [WMS GetCapabilities 1.3.0](https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolution?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0): the first read returned valid XML. Layer names: `ORTOFOTOMAPA` and `Raster` (basemap selection should use the orthophoto layer). The CRS list included `CRS:84`, `EPSG:4326`, `EPSG:2180`, and `EPSG:2176`; the full list was not retained, and **WMS EPSG:3857 was not confirmed**. WMS stated no fees and prohibited automatic downloading/collection of images (harvesting); otherwise it permitted use and compilation of the presented content. Subsequent reads of the same endpoint returned **HTTP 404**. The cause was not established, and one successful read is not treated as an operational guarantee.
- [WMTS GetCapabilities](https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMTS/StandardResolution?SERVICE=WMTS&REQUEST=GetCapabilities): valid XML in repeated reads. Layer `ORTOFOTOMAPA`, style `default`, format `image/jpeg`; matrix sets `EPSG:2180`, `EPSG:4326`, and **`EPSG:3857`**. The last set has identifiers `EPSG:3857:0` through `EPSG:3857:19`, with row/column limits. Handle this as WMTS; do not assume an arbitrary XYZ URL and zoom number are equivalent. Metadata links to Geoportal's terms and states there are no access constraints.
- Both initial capabilities responses had `Access-Control-Allow-Origin: *`. This is **an observed metadata header**, not a documented CORS guarantee for all GetMap/GetTile responses, errors, or future versions. No browser test was performed. Missing CORS can technically be handled through a local proxy for an approved host, but proxying does not remove the service's terms or outages.
- HighResolution/TrueOrtho capabilities were not read; the catalog confirms their endpoints, but do not assume identical layers, CRS, or coverage.

Default candidate for later integration testing: standard WMTS in EPSG:3857; use WMS for detail only after reconfirming operation and CRS. WMS 1.3.0 needs attention to axis order, particularly EPSG:4326; configure the client according to capabilities rather than blindly copying latitude/longitude pairs from JSON.

### Terms and attribution

[Geoportal terms, section 3](https://www.geoportal.gov.pl/pl/o-geoportalu/regulamin/) permit publication with source attribution and disclaim administrator responsibility for data accuracy and disruptions. Proposed visible basemap attribution: “Orthophoto: GUGiK / Geoportal.gov.pl” with a link. No separate CC license for this service, guaranteed SLA, or public numeric request quota was found. Lack of a quota does not mean unlimited downloading. Free use of downloadable data must not be equated with permission to harvest WMS. An interactive online MVP needs neither bulk caching nor a mirror of Poland. We are not publishing case entries/photos to Geoportal: its basemap is used within PawTrace.

## 4. Map libraries, editing, and measurements

### Option A: Leaflet + Leaflet-Geoman Free + Turf

[Leaflet](https://leafletjs.com/reference.html) is a mobile-friendly mapping library supporting raster/WMS layers, points, circles, polygons, layer switching, and events. It does not supply the data or a complete editor. Circle radius is in meters. WMTS needs an adapter/matrix configuration; native TileLayer.WMS is not a WMTS client.

[Leaflet-Geoman Free](https://geoman.io/docs/leaflet), [Draw](https://geoman.io/docs/leaflet/modes/draw-mode), and [Edit](https://geoman.io/docs/leaflet/modes/edit-mode) document drawing markers, circles, and polygons and editing shapes/vertices. The free code is [MIT licensed](https://github.com/geoman-io/leaflet-geoman/blob/develop/LICENSE). Starred features are Pro; for example, do not assume a ready-made free `cancelGlobalDragMode`. Undo and cancellation can be implemented in the application with working geometry copies and its own history. The full required workflow is not promised as a ready-made free toolbar.

Measurements need not use a paid plugin tool: [Turf distance](https://turfjs.org/docs/api/distance) computes spherical distance, and [Turf area](https://turfjs.org/docs/api/area) computes area in square meters. A GeoJSON adapter must use `[longitude, latitude]`; the PawTrace contract retains explicit coordinate names. An original circle preserves center and `radiusMeters`, rather than exporting only an approximating polygon. A small circle's area can be calculated from its radius; document the approximate nature of field measurements.

### Option B: OpenLayers without a paid editor

[OpenLayers, BSD-2-Clause](https://openlayers.org/) supports OGC sources and vectors. Its official [WMTS-from-capabilities example](https://openlayers.org/en/latest/examples/wmts-layer-from-capabilities.html) fits the confirmed GUGiK endpoint. [Draw + Modify](https://openlayers.org/en/latest/examples/draw-and-modify-features.html) demonstrates built-in editing. The [Draw API](https://openlayers.org/en/latest/apidoc/module-ol_interaction_Draw-Draw.html) includes circle/polygon/point, `finishDrawing`, `abortDrawing`, `removeLastPoint`, and touch tolerance. [Modify](https://openlayers.org/en/latest/apidoc/module-ol_interaction_Modify-Modify.html) has configurable hit tolerance and a vertex-deletion condition. Default Alt-based deletion is unsuitable for a phone; add a touch button/mode.

[Official OpenLayers measurements](https://openlayers.org/en/latest/examples/measure.html) distinguish spherical measurements from planar projected ones. **Do not calculate area or distance from raw Web Mercator coordinates**, because these are not reliable ground meters. Transform geometry and use `ol/sphere`; a circle's JSON radius must also be a ground radius, not a distorted projected radius.

Assessment: both options cover the feature set without a paid add-on. OpenLayers simplifies WMTS and editor dependencies; Leaflet has a simpler API but adds an editing plugin and WMTS integration. Neither MapLibre nor a paid provider is required for this MVP. Real-screen usability does not follow from a feature list alone: later finger-based checks, larger handles, explicit “Confirm/Undo/Cancel,” and preventing edits during ordinary panning are necessary. Committed geometry and its working copy must be separate, including the area-check history in ticket 06.

## 5. Local Windows/Docker and phones: HTTPS without publication

[W3C Geolocation](https://www.w3.org/TR/geolocation/) requires a secure context and user permission; `getCurrentPosition` provides location on demand. [W3C Secure Contexts](https://www.w3.org/TR/secure-contexts/#is-origin-trustworthy) distinguishes HTTPS and local loopback. `http://localhost` on a computer may work, but `http://192.168.x.y` on a phone is not that exception. A phone's `localhost` means the phone, not the Windows computer. Simply bypassing an untrusted-certificate warning is not a sound geolocation plan. Location may also be denied or inaccurate; retain manual positioning.

**A practical free baseline without an account, card, or publication:** local Caddy reverse proxy with a local CA and HTTPS for a stable LAN name/IP. [Caddy Local HTTPS](https://caddyserver.com/docs/automatic-https#local-https) requires every client to trust its root CA; running it in a container does not automatically install trust on Windows or the phone. Persist Caddy's CA data. [mkcert](https://github.com/FiloSottile/mkcert) is an alternative certificate-preparation tool, but also requires installing its root CA on the phone and is not itself an HTTPS server. Its project describes a developer tool, not a ready-made user distribution process. [Apple](https://support.apple.com/en-us/102390) requires explicitly enabling full trust after manually installing a profile. Android/browser behavior and managed-device policies require checks on the target hardware. Do not distribute the private CA key to testers; they need the public CA certificate.

LAN access needs a running computer, a published Docker port, the phone on the same network, an appropriate Windows Firewall rule, and no Wi-Fi client isolation. [Docker port publishing](https://docs.docker.com/engine/network/port-publishing/) distinguishes binding to loopback from other interfaces. Binding only to `127.0.0.1` does not expose the service to a LAN phone. A stable address/name reduces certificate and browser-local-storage problems. Public basemaps/search still require internet access.

**Optional decision if phone access is needed outside home Wi-Fi:** private Tailscale VPN + [Serve](https://tailscale.com/docs/features/tailscale-serve) provides HTTPS to the local service within the tailnet only. This does not require public Funnel, but needs an account, VPN clients, and certificate configuration. The current [Personal plan](https://tailscale.com/pricing) is free for noncommercial use for up to six users; do not turn this number into a PawTrace limit. The [Quickstart](https://tailscale.com/docs/how-to/quickstart) describes signup through a personal identity provider for the free plan. The reviewed pages did not provide an unambiguous current “no card” assurance, so that point remains unconfirmed for the VPN variant; the basic local-CA option uses no such service. No VPN installation or account is assumed to be authorized. The computer must remain on even with VPN.

Important product distinction: a phone in the field using mobile data cannot connect through a LAN address alone. Agreeing to “local Docker” does not resolve off-LAN access. Public publication is neither a technical geolocation prerequisite nor a requirement added by this research; a private VPN is a separate option. Without VPN/remote access, the current option works within the local network.

[Docker Desktop](https://docs.docker.com/subscription-billing/desktop-license/) is free for personal use. The proposed environment is Linux containers on Windows, not a native Windows codec. This computer's WSL2/Docker setup was not inspected and no installers were downloaded.

## 6. Photos: originals, HEIC, and infrastructure

### Persistence and filename contract — implementation proposal

Assets must not exist only in a container's writable layer. A [named volume](https://docs.docker.com/engine/storage/volumes/) exists independently of the container; a [bind mount](https://docs.docker.com/engine/storage/bind-mounts/) places files in a chosen host directory. Docker Desktop makes them available to the Linux container. Named volumes simplify isolation and permissions; bind mounts make manual viewing and copying from Windows easier. Neither is a backup. Deleting the volume, resetting Docker Desktop, or deleting the host directory may remove data. Moving the application/JSON to another server does not move images: copy assets while preserving filenames. Ordinary container recreation with the same persistent mount should retain them.

Proposed organization: persistent `/data/assets`, separate temporary space, and service caches. Generate a new unpredictable name for every file, use exclusive creation, and never overwrite on collision; the original name is optional metadata. Accept only a basename without separators/paths. Determine type from content and the decoder, not only the extension or client MIME. `photos` contains the received original's filename; `assets` links it to a thumbnail filename and optional preview. The server builds URLs relative to the current origin, so changing address does not change JSON. This design follows ticket 06 and requires no case database.

An upload first writes a temporary file, then completes persistent storage, and only then returns a valid filename. An incomplete write does not enter `photos`. Unlinking deletes neither originals nor derivatives. A missing file produces a placeholder with its name. Upload retry needs to avoid overwrites and distinguish “server saved it, client did not receive the response”; an operation key can reduce duplicates without a case catalog. These are proposals, not implemented mechanisms.

### Batch upload and camera

[HTML File Upload](https://html.spec.whatwg.org/multipage/input.html#file-upload-state-(type=file)) supports `multiple`; [HTML Media Capture](https://www.w3.org/TR/html-media-capture/) describes camera `capture`. Proposal: separate “Choose photos” and “Take photo” actions because system-picker and camera behavior depend on the phone. Selecting many files does not require one huge request: a low-concurrency queue of individual uploads provides progress and per-file retry without a case photo-count limit.

The server can guarantee the original as **the unchanged bytes of the file supplied by the browser**, not necessarily the camera file stored in the phone library. An official [WebKit issue](https://bugs.webkit.org/show_bug.cgi?id=303803) describes picker conversions depending on `accept`. An `input file` alone cannot guarantee identity with phone storage; later check input configuration on devices without client-side recompression. A system-supplied JPEG does not imply missing server HEIC support.

### HEIC — a confirmed path, not every stack's default capability

JPEG, PNG, and WebP are supported by [Pillow](https://pillow.readthedocs.io/en/stable/handbook/image-file-formats.html). A practical simple container for all formats: Linux amd64 with glibc (for example Debian slim), supported CPython, Pillow, and **Pillow-Heif with a binary wheel for that Python version/architecture**. [Pillow-Heif installation](https://pillow-heif.readthedocs.io/en/latest/installation.html) recommends pip/wheels; the current [PyPI release](https://pypi.org/project/pillow-heif/) lists manylinux and musllinux for architectures including x86_64/aarch64. Do not select an arbitrary image version and assume binary availability.

This is more than an extension declaration: the [official wheel-library build script](https://github.com/bigcat88/pillow_heif/blob/master/libheif/build_libs.py) downloads libde265 and enables `WITH_LIBDE265=ON`, without a separate dynamic plugin. [libheif](https://github.com/strukturag/libheif) uses libde265 for HEVC/HEIC decoding and x265 for encoding; the application needs HEIC reading and JPEG/PNG/WebP derivatives, not HEIC re-encoding. [Pillow-Heif](https://github.com/bigcat88/pillow_heif) declares 8/10/12-bit HEIC reading and operation as a Pillow plugin. Support is therefore documented in a practical container, but that container was not built here. Pinning releases and checking the decoder and phone files are later integration conditions, not completed tests.

Node is an alternative: [Sharp installation](https://sharp.pixelplumbing.com/install/) lists JPEG/PNG/WebP/AVIF in its binaries, but does not promise ready-made HEIC/HEVC. [Sharp HEIF](https://sharp.pixelplumbing.com/api-output/#heif) requires custom/global libvips with suitable HEIC codecs. This adds compilation/packaging work; do not confuse AVIF with HEIC. Docker Linux can use custom libvips, although Sharp does not support this setup natively on Windows. Alternatively, a Node server can invoke a separate Python worker at the cost of another component. There is no reason to reject HEIC as impossible or claim that `npm install sharp` alone satisfies the requirement.

Licenses: Pillow-Heif uses BSD-3-Clause, libheif LGPL, and codecs their own licenses. An open-source library does not automatically resolve HEVC patents; Sharp's documentation notes HEIC patent encumbrance. No basis was found for promising complete patent freedom for all future product-distribution arrangements. This technical investigation does not require a paid conversion API. No separate legal analysis of future codec distribution was performed.

### Inspecting detail and HEIC

[WebKit/Safari 17](https://webkit.org/blog/14205/news-from-wwdc23-webkit-features-in-safari-17-beta/) documents native HEIC. Comparable support was not confirmed across all target Windows/Android browsers, so full previews must not rely solely on `<img src=original.heic>`. Retain a downloadable original and JPEG/WebP thumbnail; detailed viewing needs a decision: an additional browser-compatible full-resolution preview generated immediately or on demand, or external opening of the original where no decoder exists. PNG can retain converted pixels without lossy recompression but is larger; JPEG/WebP may lose detail. Handling HDR/10-bit, EXIF orientation, and ICC profiles must be explicit; the original remains untouched. A thumbnail does not replace full quality.

### No product limits versus actual constraints

No 20 MB, photo-count, or other fixed product ceiling is proposed. **Infinite resources are not achievable.** Technical settings must not accidentally impose hidden limits without explaining the consequences:

- [FastAPI UploadFile](https://fastapi.tiangolo.com/tutorial/request-files/) uses a buffer that spills to disk. Receiving a file as `bytes` or calling full `read()` still loads all of it into RAM. Copy in chunks, maintain backpressure, and do not decode the entire selected gallery at once.
- [Starlette formparsers source](https://github.com/Kludex/starlette/blob/main/starlette/formparsers.py) defaults to `max_files=1000`, `max_fields=1000`, `spool_max_size=1 MiB`, and `max_part_size=1 MiB`. The inspected code indicates that spool is the disk-spill threshold, while `max_part_size` limits buffered fields without a filename — **it is not a general 1 MiB limit on each photo**. A one-file-per-request queue does not limit case photo count. Verify behavior for the pinned version rather than copying blog settings.
- [nginx client_max_body_size](https://nginx.org/en/docs/http/ngx_http_core_module.html#client_max_body_size) defaults to 1m; `0` disables the check. This is an example pitfall if nginx is selected, not a requirement to use nginx. Read timeouts, request buffering, and temporary disk space are separate concerns. With Caddy, also check the specific configuration of the whole chain rather than assuming nginx settings.
- Persistent and temporary disks, the Docker Desktop VM disk size, RAM, CPU, Wi-Fi speed, and browser suspension/disconnection are real constraints. Spooling and copying may temporarily create more than one original-sized copy. An upload queue does not automatically resume an interrupted individual file; retrying from the start versus chunked upload is a separate implementation decision.
- Streaming **transfer** does not imply constant-memory **decoding**. For scale, 48 million RGB pixels need about 144 MB for 8-bit samples alone, before buffers and a resizing copy; 16-bit needs more. Thumbnail processing should have limited concurrency, preferably in a separate worker/process that can recover after failure.
- [Pillow Image](https://pillow.readthedocs.io/en/stable/reference/Image.html) has `MAX_IMAGE_PIXELS` protection and decompression-bomb warnings/errors; the [Sharp constructor](https://sharp.pixelplumbing.com/api-constructor/) defaults to `limitInputPixels=268402689` and has other safeguards. These are pixel/decoder limits, not file-MB limits. Automatically disabling every safeguard does not produce unlimited capability. A photo exceeding decoder/host capacity needs a decision: retain the original with a thumbnail error or reject the photo operation. I am not choosing this compromise for the user.
- OOM, full disk, unavailable decoders, and invalid files must produce per-photo errors and retry without losing entry text. Retaining originals without deleting unlinked photos means growing disk usage; backup must include JSON and assets.

No numeric maximum upload was established: it depends on the selected image, configuration, and hardware. No boundary or public-service load tests were performed.

## 7. A short, coherent architecture option for decision

Technical proposal, **not an accepted user selection**:

1. TypeScript frontend (for example React/Vite) with **OpenLayers**, automatic local case saving, and manual JSON v1 import/export. Domain geometry is separate from projections and the working edit mode.
2. **Local FastAPI/Python + Pillow/Pillow-Heif**, serving frontend/API and assets, with an individual-photo upload queue and a derivative-generation process. No case database, multi-case catalog, or authentication.
3. **Caddy HTTPS with a local CA**; the phone trusts the public CA certificate. This option needs no external account, card, or public publication. Expose the port only to the agreed network scope; consider VPN only if the user needs off-LAN access.
4. A persistent mount for assets and service caches; separate persistent Caddy state. Bind mount versus named volume and the backup procedure remain to be decided. Photos resolve by filename; unlinking does not delete files.
5. OSM street tiles directly from the browser under the policy; orthophotos through documented WMTS. A narrow custom GUGiK proxy only if CORS requires it, not a generic open proxy. Search through a local Nominatim proxy/cache only after informed acceptance of its terms. Configurable providers and service errors isolated from case data.

Alternative if a single language is preferred: Leaflet/Geoman/Turf frontend and Node API, but HEIC requires custom libvips/codecs or a Python worker. No performance comparison was performed; choosing OpenLayers/Python is a proposal to minimize WMTS/HEIC unknowns, not a benchmark result.

A shared photo server does not synchronize cases between devices. Phone and desktop still have their own local storage and transfer JSON manually according to decisions 01/06. A shared account, database, and synchronization have not been slipped into this option. HTTPS/VPN does not change that rule.

## 8. Decisions needed from the parent/user

Product questions, not factual questions that need further searching:

1. **Phone access:** initially the same LAN only, or also mobile data in the field? If the latter, are a private VPN/account and dependence on a running computer acceptable? Do not require public publication.
2. **HTTPS:** is one-time trust of the local CA on the owner's and testers' phones acceptable? Without this, standard HTTP on the LAN does not provide the required geolocation.
3. **Community services:** does the owner knowingly choose public OSM/Nominatim with the described limits, attribution, manual search, and lack of guarantees? Nominatim in particular requires this responsible choice.
4. **Full HEIC preview:** an additional compatible full-resolution image, on-demand conversion, or external viewing of the original? Establish expected fidelity/HDR; do not silently reduce quality to a thumbnail.
5. **Photo-processing failure:** is a correctly stored original with an unavailable thumbnail a successful attachment with a warning, or an operation to retry without attaching it? This matters with no product limits and finite memory.
6. **Persistent data:** a Windows-visible bind mount or a Docker-managed volume; who preserves JSON + assets backups and how? Do not add automatic deletion of unlinked files.

React versus another frontend and exact library versions are technical decisions for the parent, not necessarily new product questions. Later implementation checks: restore assets after container replacement, import JSON on another device, location permission granted/denied through valid HTTPS, touch-based geometry creation/editing/cancellation, HEIC orientation and detail, and controlled disk/decoder errors. Ordinary public-map integration checks should be small and policy-compliant, never server capacity tests.
