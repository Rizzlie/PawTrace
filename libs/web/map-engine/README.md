# map-engine

Angular map host (`MapEngine`, selector `pt-map`) and its isolated Leaflet adapter. Consumed as `@pawtrace/map-engine`; Leaflet types do not cross the public interface.

Inputs are plain `MapConfig` (public browser token) and optional `MapViewport` (latitude, longitude, zoom). `viewportChanged` emits completed navigation, including a user-requested device location. Programmatic restoration and container resize do not emit edits. The host does not inject an application store or persist a case. Domain markers, scene reconciliation by stable IDs, and geometry drafts arrive with F07/F09.

The adapter owns the map, active basemap, temporary location/accuracy layers, listeners, satellite load timeout and ResizeObserver. Removal completes Leaflet's own cleanup before detaching remaining listeners. Both layers share the same map instance and supported zoom range. Component destruction releases all resources; late geolocation callbacks are ignored.

The application supplies Leaflet CSS globally. Mapbox mode also expects the official logo at `assets/mapbox-logo.svg`. Configuration transport belongs to the app/API, not this library.

Run `npm exec nx run map-engine:test`, `npm exec nx run map-engine:typecheck`, or `npm exec nx run map-engine:lint`. The browser acceptance suite is `npm exec nx run web-e2e:e2e`.
