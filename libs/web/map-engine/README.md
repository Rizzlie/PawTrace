# map-engine

Angular map host (`MapEngine`, selector `pt-map`) and its component-scoped `LeafletMap` service. Consumed as `@pawtrace/map-engine`; Leaflet types do not cross the public interface. `MapEngine` provides and injects the service, initializes it after rendering, and Angular calls `ngOnDestroy` when that host is removed. Separate hosts receive separate service instances.

Inputs are plain `MapConfig` (public browser token and optional source/attribution pairs) and optional `MapViewport` (latitude, longitude, zoom). `viewportChanged` emits completed navigation, including a user-requested device location. Programmatic restoration and container resize do not emit edits. Restoration is asynchronous: the latest requested view is coalesced, survives a queued/in-flight zoom animation, and applies after that animation ends. Suppression lasts until the requested view is applied. Destruction cancels pending restoration. The host does not inject an application store or persist a case. Domain markers, scene reconciliation by stable IDs, and geometry drafts arrive with F07/F09.

The service owns the map, active basemap, temporary location/accuracy layers, listeners, satellite load timeout and ResizeObserver. Removal completes Leaflet's own cleanup before detaching remaining listeners. Both layers share the same map instance and supported zoom range. Component destruction cancels pending work and disconnects the observer/listeners; if a CSS zoom is in flight, final map removal waits for its completion so Leaflet's own timer cannot touch a deleted map pane. Late geolocation callbacks are ignored.

`parseMapConfig` validates the public runtime DTO. Optional `osm` and `satellite` settings each contain `urlTemplate` and `attribution`; absent settings retain defaults. Templates contain `{z}/{x}/{y}` and may use `{accessToken}`. Basic sources use 256-pixel XYZ tiles; satellite sources use 512-pixel tiles and offset -1. The service sanitizes attribution, updates active source settings without changing the viewport, and preserves default OSM access when the API configuration is invalid.

The application supplies Leaflet CSS globally. Mapbox mode also expects the official logo at `assets/mapbox-logo.svg`. Configuration transport belongs to the app/API, not this library.

Run `npm exec nx run map-engine:test`, `npm exec nx run map-engine:typecheck`, or `npm exec nx run map-engine:lint`. The browser acceptance suite is `npm exec nx run web-e2e:e2e`.
