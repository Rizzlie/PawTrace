# Frontend architecture

Status: implemented through F10; state composition refined in [ADR 0004](../adr/0004-compose-case-signal-store-with-events.md). Point, history, planned-area and actual-search editing share the committed document and isolated editor lifecycle.

This document develops the frontend design requested after the F01–F15 task decomposition. Current discussion: [Frontend architecture, map integration, and case document lifecycle](../mvp/issues/15-frontend-architecture.md). Technical references: [frontend technology research](../mvp/research/frontend-technology-feasibility.md).

## Confirmed design constraints

- One `CaseStore` uses NgRx SignalStore with Events, composed from focused features for projections, persisted view, editor resources/lifecycle, animal/point editing, files and persistence. Its state contains the single committed document and the separate transient draft/candidate/save metadata. Reducers own all changes; async handlers perform I/O. Store and dispatcher share the workspace route scope (ADR 0004).
- A focused Leaflet module isolates the map instance, layers, markers, editing integration, and event subscriptions. Other modules exchange plain coordinates, geometry, identifiers, and user intents through its interface.
- The committed case uses the same basic serializable nested model as JSON v1. Auxiliary indexes and map projections are derived, not competing canonical entity collections.
- Framework-neutral shared Zod schemas define the document contract and inferred TypeScript types. Domain validation additionally checks cross-record relationships and geometric invariants.
- Imports reject unknown fields explicitly throughout the accepted document shape; they do not silently strip additional information.

## Root state and forms

`CaseStore.document` contains the committed serializable case, including `mapView`. The same plain state has an isolated editor session, transfer candidates and persistence revisions. These are distinct lifecycles; only the committed document is persisted/exported. Focused `signalStoreFeature` modules contribute reducers, projections, handlers and result-returning commands to one store. They do not inject each other or synchronize separate state owners. Components retain local presentation state where appropriate.

Use Signal Forms against the writable editor draft. They must not receive a committed nested document object by mutable reference. Select an Angular/Nx baseline supporting stable Signal Forms; do not substitute Reactive Forms without discussing the changed choice. Profile, history-entry, point, and area forms have explicit Save/Cancel. Save validates the draft and applies one committed document update; Cancel discards the draft. Editor-session transitions are specified below.

### Signal Forms binding

The user accepted the writable editor projection identified by the [targeted Signal Forms research](../mvp/research/signal-forms-state-binding.md): keep one authoritative editor draft, derive a `linkedSignal` editor-model handle with a custom setter, and route every setter into an immutable update of the current session. This adds a derived writable handle, not a second canonical draft. Keep it private inside the state-owner boundary. ADR 0004 composes the shared state through focused features; the form has one authoritative draft and no effect-based mirroring.

Verify the selected published Angular package declarations contain the custom setter; the general `linkedSignal` stability marker alone does not prove availability. Before implementation acceptance, verify form typing, nested writes, root-driven draft replacement, unrelated root changes, Save/Cancel isolation, and stale-session writes. Use initialized plain form payloads; map them to domain variants on confirmation. Do not implement custom signal internals or effect-based draft mirroring. F06 command and browser regressions verify this integration.

## Map module and application flow

There is no separate `MapState`. The screen derives plain-data scene projections from the state and passes them into the Leaflet module. The module owns its map instance, layer registry, plugin modes, temporary layers, and event cleanup. It contains no business rules (roles, filtering policy, validation or Save/Cancel decisions). It emits technical intents such as item selection, changed draft geometry, and a changed viewport; it does not own a second case or mutate the committed document.

Layer reconciliation uses stable domain IDs to update existing markers/shapes and remove obsolete ones. Keep active editing separate from committed rendering so an unrelated state update does not reset the user's working geometry. Only the application confirmation command publishes draft geometry into the document. Programmatic scene/view restoration must not be misreported as a new user edit.

Point movement and area changes update the active geometry draft. Save publishes the validated geometry; Cancel restores committed geometry, or removes a newly added uncommitted point/shape. Panning the map does not confirm geometry editing.

## Nx project layout

The user requires frontend libraries under `libs/web/**`, distinguishing them from API libraries. The accepted frontend seams are `libs/web/workspace`, `libs/web/map-engine`, and `libs/web/browser-persistence`, composed by `apps/web`. Feature folders inside workspace do not each require an Nx project. Create projects when their implementation tasks need them.

The framework-neutral case-domain/Zod contract lives in `libs/shared/case-domain`, as accepted by the user. It is usable by both browser and NestJS without framework dependencies. API-only libraries use `libs/api/**` when needed, with `apps/api` as their composition root.

Allowed dependencies: `apps/web` composes web libraries; workspace consumes case-domain, map-engine, and browser-persistence; map-engine and browser-persistence may consume shared contracts but never workspace. `apps/api` and API libraries may consume shared contracts, never web libraries. Shared code imports neither web nor API code. Enforce these directions with Nx project tags and module-boundary lint rules. Leaflet and its plugins stay in map-engine; IndexedDB and browser file handles stay in browser-persistence. Avoid a miscellaneous shared utility library without a concrete responsibility.

Keep API transport DTOs separate from the exported case format. Address-search and upload/derivative clients belong to web feature integration as needed; they do not introduce another case store. The server still does not persist or synchronize the case in this MVP.

## Export

Export captures the complete committed document, unaffected by active filters, and adds a fresh `exportedAt` to the file representation only. It does not change the case modification timestamp, local revision, or browser-save acknowledgement. Unconfirmed form and geometry drafts are excluded with clear interface feedback. Export remains available while a write is pending or browser persistence has failed. The shared document/file schemas should express their common structure without maintaining competing canonical case models.

## Persistence and import

Use IndexedDB through a small `idb` adapter to retain one complete plain-object document snapshot in one transaction. Acknowledge persistence only after transaction completion. Local storage representation remains JSON-compatible and restoration must validate it; IndexedDB storage itself does not establish contract validity.

A supported imported file passes syntax, strict Zod validation and domain checks before replacement confirmation. Its candidate snapshot must then be stored successfully before activating it in `CaseStore.document`. Failed replacement leaves the existing case active and its successful snapshot intact.

The confirmation presents case/animal information and counts of points, entries, areas, and photos, with replace/export/cancel actions. Errors identify affected paths/IDs. Parsing, validation, and confirmation happen outside an IndexedDB transaction.

On confirmed replacement, temporarily block document mutations, finish any in-flight writer transaction, and supersede obsolete pending old-case snapshots. Store the candidate through the shared writer, then activate it and advance the local case-session generation. Old-generation callbacks must not change the new session's status or data. Failed replacement retains the old active case and stored snapshot, with honest status for any old in-memory changes still not saved.

Startup restoration validates the stored snapshot before activation. Invalid or unsupported stored data is retained and produces a recovery choice; it is not silently replaced by an empty case. Import and explicit new-case creation remain available through the agreed replacement flow.

## Editor-session transitions

Only one editor draft is active. A request to open another editor, import, or start a new case while the draft has unconfirmed changes offers Save / Discard / Stay. Save must validate before continuing; Stay cancels the transition. Map panning alone does not discard a draft. A cancelled or invalid transition leaves the committed document unchanged.

## Autosave writer

Each committed document update receives a local revision and immediately requests a full-snapshot write. Use one writer with one in-flight job and at most the latest pending snapshot. Coalesce pending snapshots; never mutate the in-flight snapshot. Draft/UI/save-status updates do not themselves become committed case edits or trigger feedback loops.

Capture the document, revision, and case-session generation together. A successful transaction acknowledges only that captured revision. If a newer revision exists, state remains unsaved until it is stored. These revision/generation values are local bookkeeping, not new required JSON v1 facts.

On autosave failure, preserve current memory and the previous successful stored snapshot. Keep the writer recoverable, expose explicit retry and export, and retry on the next committed change. There is no continuous background retry timer. Import/new-case replacement uses the same writer and the confirmed transition rules above.

## Interfaces and command flow

These are interface responsibilities, not implemented signatures:

| Boundary               | Input                                                             | Output / responsibility                                                                           |
| ---------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Shared document parser | File text                                                         | Syntax/version/strict schema/domain result, with paths and record IDs; no state or storage writes |
| withCaseView           | Plain viewport/basemap intents                                    | Committed view updates and revisions                                                              |
| withAnimalEditing      | Form edits and close decisions                                    | Isolated session, atomic validated Save, cancellable Save / Discard / Stay                        |
| withCaseFiles          | File input, export and replacement decisions                      | Correlated candidates, editor-close coordination and replacement intent                           |
| withCasePersistence    | Revisions and persistence intents                                 | Restore, ordered snapshots, acknowledgements and durable replacement                              |
| Map host               | Plain scene, viewport, current geometry draft, session identifier | Selection, geometry-draft, and viewport intents; no root-store injection                          |
| Snapshot adapter       | Captured document snapshot                                        | Transaction-completion acknowledgement or storage error; no active-case selection                 |
| Save coordinator       | Snapshot, revision, session generation; replacement requests      | Serialized writes, newest pending snapshot, correct acknowledgement and replacement barrier       |
| File adapter           | File selection / serialized export                                | Text input / download; no domain decision or case replacement                                     |

Shared `withEditorLifecycle` owns atomic editor closure/commit and cancellable transitions; `withAnimalEditing`, `withPointEditing`, `withEntryEditing`, `withAreaEditing` and `withAreaCheckEditing` own their form conversion and validation. `EditorForm<T>` holds form resources and `EditorTransition` holds the cancellable pending decision. Each feature owns its lifecycle. File preparation coordinates the editor decision; confirmation dispatches a replacement request that synchronously blocks mutations. The persistence handler drains the writer and activates the candidate only after successful storage. Pure domain validation and scene derivation remain separately testable functions; adapter instances do not become alternative state owners. Commands cover opening/saving/cancelling editors, selecting/filtering, applying viewport changes, requesting export/import/replacement, and retrying saving. Expose narrow readonly projections rather than the root writable handle. Signal Forms controls may write only through their scoped editor binding.

Use an editor-session identifier for form and geometry intents so delayed writes from a destroyed editor cannot affect its successor. Selecting an existing point opens contextual history; beginning another dirty editor follows Save / Discard / Stay. The map adapter cleans up its listeners, temporary layers, and plugin modes on session end and destruction. Restore committed geometry on Cancel without depending on paid plugin cancellation APIs. Circles retain center/radius explicitly rather than relying on GeoJSON to preserve radius.

Viewport changes are accepted at completed user gestures rather than every animation frame. Programmatic restoration is suppressed as an edit. Persist `mapView` through the same snapshot writer; moving the map must not rewrite incident/history timestamps or the case's factual modification time. A viewport update during geometry editing preserves the draft.

## JSON pipeline

Import: read file text → parse JSON → identify supported version → validate strict nested Zod structure and semantic references/geometry → build confirmation summary → resolve dirty editor → confirm replacement → block document mutations and drain active write → persist candidate → activate new session. Validation and user confirmation must not hold an IndexedDB transaction open. Failure before activation retains the previous active case. Photo existence is checked separately and does not invalidate a case file.

Export: capture current committed snapshot → attach file-only export timestamp → validate complete v1 file representation → serialize JSON → download. Do not wait for IndexedDB to recover and do not export UI/draft/persistence fields. Date/time values remain contract strings, not automatically revived `Date` objects. Form input conversion is explicit before domain validation; do not use permissive schema coercion to repair an imported file silently.

Store only the document snapshot locally; export metadata is generated for each file. Share the base Zod shape between stored-document and file schemas, with strict fields appropriate to each. Import consumes export metadata without treating it as a case edit or maintaining another canonical model.

## Verification and implementation handoff

- F01 establishes compatible Angular/Nx versions, stable Signal Forms and public projection API availability, plus project-boundary enforcement.
- F02/F07/F09 verify scene reconciliation, intent suppression on restoration, draft isolation, stable IDs, cancellation, and map cleanup.
- F04 verifies full-model round trips, all time/identification variants, nested unknown-field rejection, broken references, and invalid geometry.
- F05 tests interleaved revisions, latest-pending coalescing, transaction failure/retry, replacement while saving, stale-session completions, invalid startup recovery, and export with an unsaved draft or failed storage. Include real-browser IndexedDB restoration/replacement tests.
- F06/F08 and subsequent editors verify actual Signal Forms bindings: nested updates write into editor only, unrelated root changes preserve draft data, Save commits once, Cancel restores correctly, and old-session events are ignored.
- F14 verifies that filters affect derived counts and visible map projections but never restrict full export or erase contextual history.

Adapter tests use controlled failures and event ordering; pure parser tests require no Angular/Leaflet runtime. The full F15 acceptance scenario validates these seams together. Research and document review are not substitutes for these implementation checks.

The [F-task execution guide](../implementation/README.md) and task-specific architecture notes carry this design into implementation. See individual task completion notes for current implementation status.

## Existing product behavior retained

The [JSON contract](../mvp/issues/06-json-contract.md), [case lifecycle](../mvp/issues/01-case-files.md), and [interface decisions](../mvp/issues/05-map-workflow.md) remain authoritative for behavior. One committed document owner does not change the agreed file contents, cancel behavior, or protection against failed saving. Implementation changes remain uncommitted for manual review.
