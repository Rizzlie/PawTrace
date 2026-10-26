# workspace

Browser feature integration, separate from the Leaflet adapter and server code.

`AddressSearch` uses Signal Forms and submits only on Enter or the search button. Its `resultSelected: AddressSearchResult` output contains an ID, label, latitude and longitude. The consumer may move the map (F03) or propose draft coordinates for explicit point confirmation (F07); selection itself never creates a point. Search input/results are transient UI state, outside the future case document.

`AddressSearchClient` calls the same-origin `/api/address-search?q=...`, validates the transport response, and performs no automatic retries. There are no direct browser requests to the geocoder.

Run `npx nx run workspace:typecheck` and `npx nx run workspace:lint`. Browser acceptance is in `apps/web-e2e/src/address-search.spec.ts`.
