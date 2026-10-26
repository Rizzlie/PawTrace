# F03 — Address search through the local API

Status: planned
Depends on: F01, F02

## Goal

Search Polish addresses on explicit submission and move the real map to a selected result. The same search result interface will support point placement in F07.

## Read first

- [Frontend architecture](../architecture/frontend.md), including library boundaries, editor ownership, and JSON/persistence flows.
- [Execution guide](README.md), [F01](F01-workspace-and-docker.md), and [F02](F02-map-and-basemaps.md).
- [Current architecture](../mvp/issues/10-local-architecture.md).
- [Nominatim findings and primary-source policy links](../mvp/research/technical-feasibility.md), section 2. Read the current provider policy before integrating.

## Scope

1. Add a dedicated NestJS address-search endpoint with input validation, Poland-restricted queries, application identification, and a configurable upstream.
2. Implement a shared request queue and cache that respect the public Nominatim policy, including at most one request per second for the application. Repeated queries should reuse cached results; the client does not contact the upstream directly.
3. Add a search field with submit/Enter, loading, selectable results, no-results, and service-error states. Typing alone makes no upstream requests.
4. Return explicit geographic coordinates and useful result labels. Selecting a result repositions the map without creating a case point.
5. Define a small reusable result-selection interface for F07, so point placement can consume the same result without a second search integration.

## Acceptance criteria

- Submitted search returns selectable Polish locations and repositions the map.
- Typing and ordinary map panning do not trigger geocoding.
- Concurrent clients use the shared queue; cached queries avoid unnecessary upstream calls.
- Network/rate-limit/no-result errors leave manual navigation usable and do not trigger an automatic retry loop.
- Only address-query information is sent upstream; case history is not part of the request.

## Validation

Use controlled upstream responses to verify queue spacing, caching, error handling, and selection. Perform a small policy-compliant real search as an integration check. Verify that selecting a result alone creates no point and that the provider can be changed by configuration.

## Architecture integration

Keep address-search UI/client integration in web features and proxy implementation in API code. A selected search result proposes draft coordinates; it does not bypass point confirmation or create a second case state.

## Completion notes

To be filled during implementation.
