# Frontend architecture, map integration, and case document lifecycle

Parent: ../map.md
Label: wayfinder:grilling
Type: grilling
Status: claimed
Assignee: macsy
Blocked by: none

## Question

What concrete frontend architecture should guide the F-series implementation tasks? Decide ownership of committed case data, transient workspace state and drafts; the Leaflet module interface and event flow; canonical versus normalized data representation; runtime JSON contracts, import/validation/replacement and export; browser persistence and asynchronous save coordination; Angular state/form choices; Nx project seams and test surfaces. Preserve accepted product behavior and discuss architectural trade-offs with the user before recording them as accepted decisions. Produce a cohesive architecture document and update affected F tasks after agreement, without application implementation or commits.

## Comments

The user explicitly requested a deeper frontend architecture interview after the initial F01–F15 decomposition. The decomposition remains a plan, not implemented code; technical choices previously left to implementation are being made explicit here. Primary-source facts are being checked in [Frontend technology and browser persistence feasibility](16-frontend-technology-feasibility.md).

Initial independent interview topics: one committed case source of truth versus transient UI/draft state, a narrow Leaflet-specific module rather than a generic multi-engine framework, nested case data matching the JSON contract versus normalized entities, a shared runtime contract, and handling unknown fields on import. Concrete library selection, save sequencing, map editing sessions, and import replacement details will follow their prerequisites.

### First interview round

- The user requires one application state, rather than separate state owners for case/workspace/drafts. The root-store shape and representation of unconfirmed edits still need clarification; do not reinterpret this answer as acceptance of three separate stores.
- The user accepted isolating Leaflet behind a focused map module with a small interface. Leaflet objects stay inside that module; other modules use plain geographic values and identifiers.
- The user accepted the same basic nested case model in memory and JSON, including `points[].entries`, rather than maintaining a second normalized canonical representation. Derived lookup indexes are allowed.
- The user selected Zod for a shared runtime contract with inferred TypeScript types and common domain-validation rules.
- Unknown fields in a supported-version import must produce an error rather than being silently stripped. This applies to nested objects too, not just the root.

Next choices: a single root store's internal sections and draft semantics, native signals versus SignalStore, form approach, and replacement behavior if persistence of a valid imported candidate fails. Research has completed; its note requires review before recording library-dependent decisions.

### Second interview round

The user confirmed one `AppState` with `document`, `ui`, `editor`, and `persistence` sections; one plain Angular signals service owns it. Components read state and call explicit methods; NgRx is not selected. The user selected Signal Forms, not the proposed Reactive Forms. Select a supported Angular baseline with stable Signal Forms and compatible Nx versions; the technology research documents the stability distinction.

IndexedDB with `idb` stores one complete plain-object document snapshot in a transaction. A valid imported candidate becomes active only after its replacement write completes successfully. On replacement-write failure, keep the existing case active and preserve its successful stored snapshot. Export remains document-only; UI, drafts, and persistence bookkeeping are not exported. The document's agreed `mapView` remains part of its contract.

Next discussion: explicit form submission versus immediate field commits, map draft ownership/reconciliation, autosave scheduling and retry, commands and derived projections, and replacement while edits or writes are in progress.

### Third interview round

- The user confirmed explicit Save/Cancel for profile, history-entry, point, and area editors. Signal Forms write only the editor draft. Confirmation validates the draft and applies one committed document change; cancellation discards the draft.
- The map module consumes a plain-data scene and emits intents such as point selection, draft-geometry changes, and viewport changes. The Angular integration connects it to the single state owner. Keep an ID-to-layer registry and update existing layers rather than recreating all map objects on unrelated state changes.
- Each committed document change requests a full-snapshot save immediately. One write is in progress; pending work is coalesced to the newest snapshot. Acknowledgements belong to the actual saved revision, so an older completion cannot mark newer memory as saved.
- After automatic-save failure, retry on the next committed change or an explicit Retry action. Retain failure/unsaved feedback and manual export; no continuous retry timer was selected.

Remaining lifecycle questions: one active editor and navigation/replacement with a dirty draft, a useful import-confirmation summary, edits during the final replacement transaction, and behavior when stored data fails restoration validation. Module layout and interface/test details follow these lifecycle decisions.

### Fourth interview round

- One active editor draft at a time. Switching to another editor, import, or new-case creation with unconfirmed changes offers Save / Discard / Stay. Ordinary map panning remains available.
- A valid import candidate produces a confirmation summary with case/animal information and point, entry, area, and photo counts. The existing replace/export/cancel decision happens there. Validation errors identify paths/IDs.
- After import confirmation, block document editing during the final writer/replacement phase. Finish the active write, supersede obsolete pending snapshots, persist the candidate, and then activate it. Failed replacement leaves the previous case active; stale old-session callbacks must not overwrite or acknowledge the new session.
- If a stored snapshot fails startup validation, retain it, explain the problem, and offer importing JSON or consciously starting a new case. Startup must not silently overwrite it with an empty case.

Next: concrete Nx library structure and export side effects. A narrowly scoped technical follow-up checks how Signal Forms binds to a single state's editor without unsupported writable-signal wrappers or an independently authoritative draft store.

### Technical follow-up and open fifth round

The [Signal Forms binding research](../research/signal-forms-state-binding.md) completed. Current documented `linkedSignal` custom setters provide a potential writable editor projection into one authoritative root. Package availability and integration remain untested; this is not yet an adopted binding decision.

Questions Q19–Q21 have been presented and await the user's answers: the proposed moderate Nx project layout, side-effect-free document export with file-only `exportedAt`, and Save/Cancel geometry editing. Do not record those proposals as accepted until answered.

### Fifth interview round answers

- Q19: the user requires frontend libraries under `libs/web/**` to distinguish them from the API. Preserve the proposed functional seams there. The placement of the framework-neutral shared case contract is a follow-up, not permission to make NestJS depend on web-only libraries.
- Q20: accepted side-effect-free export of committed data, file-only `exportedAt`, unchanged case modification/save status, and exclusion of unconfirmed drafts with visible feedback.
- Q21: accepted geometry drafts with explicit Save/Cancel; cancellation restores existing geometry or removes a newly created unconfirmed object. Map panning does not commit geometry.

Next frontier: confirm shared-contract location and the researched Signal Forms writable projection into one authoritative root.

### Sixth interview round answers

- Q22: accepted `libs/shared/case-domain` for framework-neutral models, Zod schemas, and validation; web-only libraries use `libs/web/**`, API-only libraries use `libs/api/**`.
- Q23: accepted one authoritative root signal plus the public custom-setter `linkedSignal` editor projection. This is not an independently synchronized draft. Selected-package availability and integration checks remain implementation acceptance requirements.

The architecture document now consolidates the agreed design, boundary responsibilities, JSON flows, and verification seams. F tasks reference it. No unresolved product/architecture question remains; final overall plan confirmation is pending. No application implementation or commits were authorized by this interview.
