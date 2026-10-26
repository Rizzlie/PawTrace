# Frontend technology and browser persistence feasibility

Research date: 2026-10-26. Documentation investigation only; no packages installed, builds, prototypes, implementation, or integration tests performed. Recommendations below are candidates for the architecture interview, not accepted decisions. Current documentation is cited without selecting package versions for installation.

## Context and fixed boundaries

Read the current answers in [06 JSON contract](../issues/06-json-contract.md), [01 case lifecycle](../issues/01-case-files.md), [10 local architecture](../issues/10-local-architecture.md), and implementation tasks [F04](../../implementation/F04-domain-and-json-contract.md) / [F05](../../implementation/F05-case-persistence.md).

Those documents already select Nx, Angular, Leaflet, NestJS and local Docker; one browser-owned case; complete manual JSON transfer; stable text IDs; nested `points[].entries` in exported v1; validation before replacement; explicit event-time precision including unknown; and separate `mapView`. The task brief additionally fixes unconfirmed drafts outside persistence. Save failure must preserve current memory and the previous successful stored snapshot. There is no MVP cross-tab lock or synchronization. Assets remain server filenames, never library objects, full URLs or image payloads in the case.

F04's reference to preserving future fields should be read alongside its requirement to implement the complete known v1 model, including fields without forms yet. It does not establish acceptance of arbitrary unknown keys or unsupported future versions. That distinction needs an explicit import policy.

## Angular state and forms

**Verified:** `asReadonly()` removes the signal's public `set`/`update` interface but does not prevent deep mutation. Computed signals are readonly, lazy and memoized; default signal equality is referential (`Object.is`). [Angular signals](https://angular.dev/guide/signals).

**Recommendation:** keep writable state private, expose readonly values and explicit domain methods, and replace changed objects/arrays along the updated path. Readonly TypeScript properties alone are not runtime immutability. Do not hand a committed nested object to a form or map editor that mutates it. Derive filtered points, counts, selected-record lookups and scene descriptions with computed projections rather than storing competing copies. Neither custom signals nor SignalStore requires flattening exported histories; any internal normalization would need an explicit lossless adapter.

**Verified:** Angular recommends computed state over effects that copy one signal into another. Effects fit imperative external APIs, including storage and third-party rendering. `onCleanup` runs before re-execution or destruction; `afterRenderEffect` is available when integration needs the rendered DOM. [Angular effects](https://angular.dev/guide/signals/effect).

**Recommendation:** an effect may request persistence or update the Leaflet scene, but it is not a save queue, transaction boundary or record of every edit. Capture the intended committed snapshot and revision before asynchronous work. Keep save-status signals out of the state being automatically saved, avoiding a feedback loop. Initialize the map after its container exists, then release resources with the owning component.

**Verified stability correction:** current official documentation lists Signal Forms as **stable in Angular v22+**, Reactive Forms as stable, and the `form` API as stable since v22.0. The v21 tutorial labels Signal Forms experimental. The overview's prerequisite “v21 or higher” therefore does not mean stability in v21. [Current comparison](https://angular.dev/guide/forms/signals/comparison), [current form API](https://angular.dev/api/forms/signals/form), [v21 tutorial](https://v21.angular.dev/tutorials/signal-forms).

Reactive Forms are strictly typed by default. A control's reset may produce `null`; `nonNullable` changes reset behavior. Disabled controls are omitted from a group's `.value`; `getRawValue()` includes them. [Typed reactive forms](https://angular.dev/guide/forms/typed-forms).

Signal Forms use the supplied writable model directly; editing a field changes that model rather than an independent copy. [Signal Forms form API](https://angular.dev/api/forms/signals/form).

**Recommendation:** typed Reactive Forms are a conservative baseline familiar to an Angular developer, but rejecting Signal Forms as currently experimental would be factually wrong on v22+. Either can satisfy the MVP. Whichever is chosen, edit an isolated draft and publish one validated domain change on Confirm. Cancellation discards the draft. Form validation helps interaction but cannot replace complete import validation. Preserve explicit `null` versus negative answers when mapping controls to the domain; do not blindly serialize a form group's `.value` as a case.

## SignalStore versus a focused signals service

**Verified:** SignalStore returns an injectable service. `withState` creates state signals, including lazy nested signals; `withComputed` adds derived values, and `withMethods` defines mutations and side effects. Stores can be root- or locally provided. External state patching is protected by default, with `protectedState: false` as an opt-out. Promise-based async methods are supported. [Official SignalStore guide source](https://github.com/ngrx/platform/blob/main/projects/www/src/app/pages/guide/signals/signal-store/index.md).

NgRx requires immutable `patchState` updaters. Its documentation demonstrates copying the nested object being updated. Protection against external patching should not be mistaken for deep freezing returned values. [Official SignalState update guidance](https://github.com/ngrx/platform/blob/main/projects/www/src/app/pages/guide/signals/signal-state.md), [Angular readonly caveat](https://angular.dev/guide/signals#converting-writable-signals-to-readonly).

RxJS integration is opt-in. `rxMethod` accepts static values, signals, computations or observables and ties cleanup to its injector by default; ordinary Promise methods remain possible. The caller supplies operators and response handling. [Official NgRx RxJS integration](https://github.com/ngrx/platform/blob/main/projects/www/src/app/pages/guide/signals/rxjs-integration.md).

NgRx explicitly documents that effects can coalesce same-tick changes, whereas `watchState` tracks synchronously. Neither fact is a guarantee that asynchronous persistence finishes in semantic order. [Official state tracking](https://github.com/ngrx/platform/blob/main/projects/www/src/app/pages/guide/signals/signal-store/state-tracking.md).

**Comparison / recommendation:** both routes can own one committed case, independent view state and save metadata behind commands such as confirm entry, correct point location and replace validated case. A focused Angular service needs private writable signals, public readonly/computed signals and a small persistence collaborator. SignalStore supplies a consistent composition vocabulary, dependency injection and optional RxJS methods. It does not decide ownership, normalize IDs, validate imports or make writes atomic. Use it if its conventions improve this team's code; the bounded MVP does not itself require it. Keep one deliberate owner alive for the case session; accidentally providing a second instance in a dialog or route would create competing copies in either design.

## Runtime JSON validation and time preservation

**Verified:** Zod `safeParse` returns a discriminated success/error result rather than throwing a validation exception; `z.infer` derives the output type. Inputs and outputs can differ when transforms are used. Async refinements require async parsing. [Zod basics](https://zod.dev/basics).

Ordinary Zod object schemas strip unknown keys by default. `z.strictObject` rejects them, `z.looseObject` preserves them, and `.catchall` validates extra values. This is per-object behavior: making the root strict does not configure every nested object. Ordinary primitives validate types; coercion is explicitly available through `z.coerce`. Discriminated unions and refinements support variant and semantic checks; `.superRefine` can emit multiple issues. ISO datetime validation disallows offsets by default unless configured to accept them. [Zod schema API](https://zod.dev/api).

**Recommendation:** parse JSON into an `unknown` boundary, then validate the complete supported-version schema and cross-record semantics before any replacement. Infer the shared TypeScript contract from that schema where practical. Use non-coercing fields; do not silently turn `"12"`, `"false"`, blank text or `null` into other values. For an exact/approximate/range/date-only/unknown time union, validate the discriminator and only its permitted fields. Configure offset-bearing moments deliberately; keep original descriptions and date-only strings unchanged.

**Unknown-field policy needs a decision:** fail visibly on unknown fields, or preserve them with a defined compatibility policy. Recommendation for a closed MVP v1: reject unknown keys at every closed nested object, including each union variant. This avoids silent stripping without pretending future semantics are understood. If permissive preservation is chosen, every mutation/export path must retain those extra fields. Implement all known v1 fields even before their forms exist; do not rebuild exports from currently visible controls. Neither option authorizes unsupported schema versions.

**Application-owned semantic validation:** uniqueness of IDs across their defined scope, escape-point existence, referenced observation existence and type, valid coordinate ranges/radii, polygon rules and interval ordering need explicit checks. Zod can host those checks or they can run as a separate pure pass after structural parsing; it cannot infer PawTrace's relationships. Report paths and IDs, e.g. `points[2].entries[1]`, rather than only “invalid file.” Missing server images remain valid references, as already decided; validation must not depend on an asset-server round trip. Different-animal identification and rejection remain independent.

**Verified:** native `JSON.parse` interprets JSON grammar into JavaScript values; it does not infer dates or convert a quoted numeric/boolean string into a number/boolean. A reviver can change values, so omitting it matters here. JSON numbers use JavaScript numeric representation; stable IDs should remain strings. `JSON.stringify` permits object `toJSON` behavior, which is another reason not to put class instances into the interchange model. [ECMAScript JSON algorithms](https://tc39.es/ecma262/multipage/structured-data.html#sec-json.parse).

**Recommendation:** keep timestamp strings in canonical data. Use temporary date values only for computations and formatting, without writing them back as normalization. Converting an offset timestamp to `Date` and serializing it can lose its original representation. Date-only/unknown event time must never become invented midnight or creation time. Round-trip means preserving contractual values and identities, not original whitespace or property ordering; export time is intentionally regenerated.

## IndexedDB snapshots and write acknowledgements

**Verified:** IndexedDB commits transaction changes atomically; commit failure writes none of them. Overlapping read/write transactions are scheduled in creation order. Durability is separately governed by a hint (`default`, `strict`, `relaxed`); transaction success is not an absolute guarantee against power loss. [IndexedDB transactions](https://www.w3.org/TR/IndexedDB/#transaction-concept), [durability definitions](https://www.w3.org/TR/IndexedDB/#transaction-durability-hint).

Structured serialization supports more than JSON, including dates and maps, but does not preserve arbitrary class semantics and cannot clone functions. IndexedDB uses storage serialization, not JSON text serialization. Thus storing a plain object does not automatically enforce the JSON contract. [HTML structured serialization](https://html.spec.whatwg.org/multipage/structured-data.html#safe-passing-of-structured-data), [IndexedDB values](https://www.w3.org/TR/IndexedDB/#value-construct).

**Recommendation:** one fixed “current case” record containing the complete validated snapshot is sufficient as a candidate baseline. Put the replacement in one read/write transaction; do not delete or clear the successful snapshot in a separate transaction first. If metadata/view state are stored in multiple records and must agree, update them within the same transaction. Structured-cloned plain JSON-compatible data avoids an obligatory stringify/parse cycle; JSON text is also a valid storage payload if exact serialization reuse is preferred. Neither representation removes validation on restoration, or provides a measured performance advantage here.

**Verified:** the thin `idb` helper wraps IndexedDB with promises and TypeScript support. `tx.done` resolves on successful transaction completion, rejecting on failure; individual request success alone is insufficient acknowledgement. Its documentation warns against awaiting unrelated async operations such as fetch inside a live transaction because it can auto-close. [idb documentation](https://github.com/jakearchibald/idb#transaction-lifetime), [transaction completion](https://github.com/jakearchibald/idb#txdone).

**Recommendation:** use native IndexedDB behind a tiny adapter, optionally with `idb` to simplify completion/error handling. Finish validation, serialization and snapshot capture before opening the transaction. Dexie is not needed to justify a single-record snapshot adapter; richer indexed querying or a larger database API would be a reason to investigate it later, not to add it now.

Storage is scoped by storage keys/origins and subject to quota and persistence policies. Browser-managed storage is not a user-controlled backup. [WHATWG Storage Standard](https://storage.spec.whatwg.org/).

**Implication:** changing protocol/host/port can expose a different local store; Docker's asset bind mount does not back up IndexedDB. Manual JSON export remains essential. Do not promise recovery after site-data clearing or eviction.

### Proposed ordering algorithm, not a platform guarantee

The following is an implementation candidate derived from F05, not behavior supplied by Angular, NgRx or IndexedDB:

1. Give each committed in-memory change a monotonically increasing local revision. Capture an immutable snapshot, revision and session/replacement generation together. Drafts are excluded. These are local bookkeeping, not new required exported-v1 fields.
2. Use one application-owned writer, creating transactions in the intended order. A Promise queue or serialized observable pipeline is sufficient. RxJS `concatMap` waits for each inner observable to complete before processing the next and warns that unrestricted input can accumulate a queue. [RxJS operator source](https://github.com/ReactiveX/rxjs/blob/7.x/src/internal/operators/concatMap.ts). Pending full snapshots may be coalesced to the latest only if that policy is explicit; never mutate the in-flight snapshot.
3. A successful transaction acknowledges the revision actually written. If revision 8 finishes while memory is at revision 9, record 8 as persisted and continue displaying unsaved state. Do not acknowledge whatever revision happens to be current at completion.
4. Failure does not advance the persisted revision, roll memory back, clear storage or disable export. Catch the failure without permanently poisoning the queue. A later successful complete snapshot can supersede a failed earlier one. Keep the failure/unsaved indication until the current snapshot is successfully stored; define retry timing separately.
5. Replacement must use the same writer boundary. Do not let an old pending case write run after the imported/new case. Resolve an in-flight transaction and discard/supersede obsolete pending jobs before the replacement write. Generation checks prevent stale callbacks from changing new-session status; they do not undo an old transaction that has already committed. IDs alone cannot distinguish two sessions importing the same case ID.
6. Validate a candidate first, then obtain the existing warning/export/cancel decision before replacement. If confirmed replacement cannot be stored, preserve the previous successful stored snapshot. Whether the candidate becomes the new unsaved in-memory case or replacement is withheld is a product decision still needing clarification.

This handles ordering within one application instance. It is not a cross-tab lock or device synchronization. A debounce or browser-unload handler does not establish successful persistence; no such guarantee is claimed.

## Leaflet scene, events and editing

**Verified:** Leaflet supplies setters such as marker `setLatLng`, polygon `setLatLngs`, path `setStyle`, and circle `setRadius` (meters). Layer groups support removal/clearing; event subscriptions can be detached with `off`, and map `remove()` destroys the map and clears related listeners. Circle `toGeoJSON` yields a point feature, so it is not a complete center/radius domain serialization. [Leaflet reference](https://leafletjs.com/reference.html).

Geoman documents drawing creation events and per-layer edit enable/disable. `pm:edit` reports an edit; `pm:update` occurs when editing is disabled after coordinates change. Its `cancel()` and cancel events are starred Pro features. A plugin edit event is therefore not an application Confirm. [Geoman draw lifecycle](https://geoman.io/docs/leaflet/modes/draw-mode), [edit lifecycle and feature markings](https://geoman.io/docs/leaflet/modes/edit-mode).

**Recommendation:** maintain an adapter-owned registry from stable domain IDs to Leaflet layers. Reconcile committed plain-data projections into layers, updating existing layers where appropriate and removing obsolete layers/handlers. Recreating every layer on every state update is unnecessary and can disrupt selection or active editing; this is a lifecycle concern, not a benchmark claim.

Keep active edit layers/working geometry separate from committed rendering. Copy coordinates to plain draft data, then validate/publish on Confirm. Cancel disables editing and reconstructs the committed geometry without depending on a paid cancel API. Suppress edit callbacks caused by programmatic restoration and prevent normal scene reconciliation from overwriting an active draft. Tear down plugin modes, application handlers, temporary layers and the map on destruction. Persist map center/zoom/basemap as view settings without feeding restoration back as domain edits.

Shared contracts should contain explicit latitude/longitude, radius and vertices, never `L.Map`, `L.Layer`, `L.LatLng`, Geoman event payloads, Angular signals or Nest DTO decorators. Preserve circle center/radius and historical check footprints directly. Application IDs must not come from Leaflet's internal object identifiers.

## Nx enforcement

**Verified:** Nx provides tag-based dependency enforcement through the JS/TS lint rule `@nx/enforce-module-boundaries`. Language-agnostic graph-wide Conformance enforcement is a separate Enterprise capability, not a prerequisite for this TypeScript workspace. [Nx boundary mechanisms](https://nx.dev/docs/features/enforce-module-boundaries).

The lint rule supports project-tag constraints, external-package allow/deny lists and a nested-external-import option. Rules apply when lint runs; tags do not create runtime isolation. [Nx rule options](https://nx.dev/docs/kb/enforce-module-boundaries).

**Recommendation:** tag the framework-neutral domain/contract libraries so they can depend only on allowed neutral libraries and schema packages; forbid browser/framework/server dependencies there. Keep Angular/Leaflet and IndexedDB adapters on the browser side and filesystem/codecs/Nest transport on the server side. Review Node built-in imports with lint restrictions as needed rather than assuming project tags alone exclude them. Add the checks to routine validation when implementing; no Nx configuration is changed by this research.

## Minimal route for parent consideration

Start with a focused case-session signals service, immutable confirmed updates, computed projections and isolated form/map drafts. Typed Reactive Forms are a conservative candidate; stable Signal Forms on v22+ are also valid. Use a complete shared Zod v1 schema plus explicit semantic validation, with strict nested unknown-key rejection proposed for discussion. Keep one transactional IndexedDB snapshot adapter, optionally using `idb`, and one serialized writer with revision/generation acknowledgements. Isolate Leaflet/Geoman lifecycle and plain geometry conversion in the browser adapter. SignalStore can replace the state-service mechanics without changing these ownership boundaries; no generic state engine, database ORM or synchronization layer is required.

This is a scope-based recommendation, not measured evidence that a service is faster, SignalStore is excessive, or structured objects outperform JSON text.

## Unresolved interview choices only

- Focused signals service or SignalStore conventions; root versus case-session provider lifetime and the public command interface.
- Typed Reactive Forms or stable Signal Forms on the selected Angular baseline.
- Reject unknown v1 keys or deliberately preserve them; establish nested behavior and error presentation without silently dropping data.
- On a valid, confirmed import/new-case replacement whose storage write fails, activate the candidate as unsaved in memory or keep the current case active. Both must retain the previous successful stored snapshot and truthful status.
- Autosave scheduling/coalescing/retry behavior and how map-view changes affect save-status presentation. The requirement to save automatically and acknowledge only real success is already settled.

Package compatibility, the chosen storage representation, optional `idb`, and concrete module layout are implementation decisions for the parent, not additional product prerequisites.

## Deferred implementation checks

F04/F05 should verify full known-v1 round trips (including fields without UI), every event-time variant and offset string, unknown keys at nested paths, malformed imports, duplicate/broken IDs and geometry. Verify confirmed versus cancelled drafts, real-browser transaction abort/quota failure/recovery, old snapshot survival after reload, delayed revision acknowledgements, edits during saving, and replacement while a write is pending. Exercise Geoman Confirm/Cancel, programmatic-update feedback and component teardown with the pinned library versions. Verify Nx rejects forbidden imports. These are unperformed integration checks, not open product choices or reasons to build a prototype during this research.
