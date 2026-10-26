# Signal Forms binding to the PawTrace application state

Research date: 2026-10-26. Primary-source documentation and source inspection only. No frontend code, prototypes, installs, builds, or integration tests. Read alongside [frontend architecture](../../architecture/frontend.md), [issue 17](../issues/17-signal-forms-state-binding.md), and [prior frontend research](frontend-technology-feasibility.md). This note proposes an integration; it does not amend the user's architecture decision.

## Finding and smallest recommendation

**Yes: current Angular exposes a public writable projection API.** `linkedSignal` now accepts a custom `set` callback. Angular explicitly documents using it to update a property inside a parent object with an immutable parent update. This is materially different from ordinary `linkedSignal` without that callback, whose local writes do not automatically write back. See [the public signature](https://angular.dev/api/core/linkedSignal) and [the documented parent-property example](https://angular.dev/guide/signals/linked-signal#updating-a-property-inside-a-parent-object).

**Recommendation, conditional on the chosen Angular baseline containing that option:** retain the single private authoritative `WritableSignal<AppState>` in the single owning service. Create a private `linkedSignal` projection reading the initialized editor form model from that root; its custom setter updates only that editor path using the current root and immutable ancestor copies. Pass this genuine Angular-created writable projection to `form()`. Do not call `rawSet`, retain an independent draft, or synchronize with effects. Keep the projection and form lifecycle inside the state owner's boundary; components receive only the intended field subtree and commands.

This preserves one authoritative root and one draft, but **does create an additional derived `WritableSignal` handle** with Angular-managed cached data. It is not literally one writable signal object in the entire program. If “single root” means one authoritative application-state container, this pattern fits. If it forbids even derived writable handles created by application code, use the whole-root form alternative below. Do not silently equate these interpretations.

## Evidence and version boundary

- `form<TModel>` requires `WritableSignal<TModel>`; the documented model remains its source of truth, and field edits write to that supplied model. The API is marked stable since v22.0. There is no setter/getter pair overload on `form`. [Public form API](https://angular.dev/api/forms/signals/form).
- The current `linkedSignal` overloads return `WritableSignal<D>` and accept `set(value, rawSet)`. In source, `set` invokes that callback; `update` computes from the current untracked getter and invokes the same callback. This is a framework-provided signal, requiring no application implementation of `SIGNAL` or `WritableSignal`. [Pinned implementation](https://github.com/angular/angular/blob/61fe5ca/packages/core/src/render3/reactivity/linked_signal.ts).
- Angular's tests explicitly exercise routing writes back to the source and routing `update` through the custom setter. These are upstream tests inspected, not tests run against PawTrace. [Pinned tests, “with custom setter”](https://github.com/angular/angular/blob/61fe5ca/packages/core/test/signals/linked_signal_spec.ts).
- The docs inspected identify their build as `v22.2.3+sha-61fe5ca`; that source revision contains the option. The general “stable since v20.0” marker on `linkedSignal` does **not** establish when its custom setter was introduced. Requests for GitHub refs `22.0.0` and `22.2.3` returned 404. This investigation establishes current documented API and pinned-source availability, **not an exact minimum published package version**. Before choosing the Angular/Nx baseline, verify that its installed public declarations include `linkedSignal`'s `set` option; do not assume every v20/v21/v22 baseline has it. [Current API and build footer](https://angular.dev/api/core/linkedSignal).

**Inference:** combining the documented projection with the documented `form(WritableSignal)` contract should provide the required scoped binding. No source inspected promises this exact PawTrace composition or its editor-session lifecycle; local type checking and integration verification remain necessary.

## Draft shape and editor lifecycle

Use an explicit, initialized, plain-data form model for each active editor. Angular requires plain objects/arrays in the structural layer; `undefined` means no field. Nullable leaves can work when their controls support them; native text inputs require an empty string rather than `null`. Structural class instances, `Map`, and `Set` are unsuitable. Avoid blanket deep freezing: Angular documents array tracking writes that can fail for frozen items. [Form models](https://angular.dev/guide/forms/signals/models#supported-model-structures).

The official design guidance prefers stable structure: an object-or-null model has no child fields while null; optional fields disappear; replacing discriminated variants can discard previously entered variant data. It recommends a static form shape containing the potential branches, with conditional visibility/availability, and permits dynamic arrays and values treated atomically by controls. **PawTrace recommendation:** keep session activity/target metadata separate from an initialized form payload within `editor`; map that payload to the committed domain union only on Save. This changes neither the JSON contract nor the authoritative location of the draft. The exact editor payload shape remains an architecture choice. [Form model design](https://angular.dev/guide/forms/signals/model-design).

The public `FieldTree` and `MaybeFieldTree` types preserve model-dependent structure; the latter can include `undefined`, and `FieldTree` has conditional child types. Do not assume narrowing a separately read discriminator automatically narrows a field tree or makes absent descendants safe. [FieldTree API](https://angular.dev/api/forms/signals/FieldTree), [pinned type definitions](https://github.com/angular/angular/blob/61fe5ca/packages/forms/signals/src/api/types.ts). `applyWhenValue` has a public type-guard overload for conditionally applying a narrowed **schema**; it is not a writable projection or a guarantee that arbitrary template union narrowing works. [applyWhenValue API](https://angular.dev/api/forms/signals/applyWhenValue).

Application behavior, not Angular guarantees:

1. Open an editor by constructing an isolated draft payload from committed data, without shared mutable nested references. Initialize the payload before mounting its controls.
2. Projection writes replace only the draft path. Preserve sibling sections from the current root; do not reconstruct the root from a captured snapshot. Use referential equality, not equality based only on an entity ID, which could suppress changed draft contents.
3. Save validates the draft and domain result, then performs the agreed single root update publishing `document`, revision bookkeeping, and editor transition together. Request persistence only for that committed change.
4. Cancel discards/reinitializes the draft without changing `document`. `field().reset()` without a value clears interaction state, not model data; it is not automatic rollback. [FieldState reset API](https://angular.dev/api/forms/signals/FieldState#reset).
5. A projection tied to an editor session must reject stale writes after switching sessions. Do not let a component retained for editor A write into editor B. Unmount/reset the relevant form state on transitions; binding alone does not implement Save / Discard / Stay.

## If the projection API is unavailable or the handle count is literal

### Preserve the literal application root: form on the whole root

Create `form(rootState)` privately and bind/pass only its `editor` payload subtree to controls. A field subtree is already a public `FieldTree`, and its `FieldState.value` is writable; a second form is unnecessary. Nested fields write through to the supplied root model. This is a supported composition of the public APIs, although Angular does not specifically recommend treating all application state as a form. [FieldTree](https://angular.dev/api/forms/signals/FieldTree), [FieldState](https://angular.dev/api/forms/signals/FieldState).

Source corroboration: the root field retains the supplied signal, child structures use an internal `deepSignal`, and that utility copies parent arrays/objects while propagating updates upward. Its implementation touches `SIGNAL`: it is **internal evidence**, not an API to import or copy into PawTrace. [Field structure](https://github.com/angular/angular/blob/61fe5ca/packages/forms/signals/src/field/structure.ts), [internal deepSignal](https://github.com/angular/angular/blob/61fe5ca/packages/forms/signals/src/util/deep_signal.ts).

Caveats/inferences for PawTrace: the entire root becomes the model surface, including committed document/UI/persistence. Keep that broad writable tree private and attach rules/controls only where intended. Check editor-subtree validity/errors rather than relying on root-wide aggregate form state; never use a root reset to cancel an editor, since it could restore unrelated document or persistence state. All traversed state must satisfy Signal Forms' structural requirements. Nullable/discriminated editor structure still needs the treatment above. Lazy field construction is not evidence of acceptable performance on a growing case; measure if this fallback is selected. Angular itself creates internal writable field/state signals, so “one signal anywhere, including framework internals” is not a feasible interpretation.

### Preserve one owner, relax literal storage: private section signals

One service may instead own private writable `document`, `ui`, `editor`, and `persistence` signals and expose a computed aggregate `AppState`. Make the editor form payload directly writable at its own storage boundary, so `form` receives its actual signal; if it remains buried inside an editor wrapper, projection is still required. The aggregate is derived, never mirrored, and no duplicate canonical draft exists. Computed signals are readonly; this is a storage-layout alternative, not a setter-capable computed projection. [Angular signals guide](https://angular.dev/guide/signals#computed-signals).

This retains one logical owner but **changes a literal single-root decision** and therefore needs the parent's explicit architecture confirmation before adoption. It also loses a single root update for cross-section publication: commands must coordinate section writes, and no transactional guarantee for synchronous readers should be assumed. It is unnecessary if the documented custom-set projection is available and derived handles are acceptable.

## Why input/model do not remove the issue

`input()` is not writable by the receiving component, so it cannot directly satisfy the writable form model contract. It can carry an existing field subtree to a child without creating another draft. [InputSignal API](https://angular.dev/api/core/InputSignal).

`ModelSignal` does extend `WritableSignal`, but `model()` is a component/directive input-output facility. Its source allocates a separate input signal node and emits changes; two-way binding wires parent communication. It is not a service-level lens into an arbitrary nested root and adds a component binding/lifecycle boundary. [ModelSignal API](https://angular.dev/api/core/ModelSignal), [model input guidance](https://angular.dev/guide/components/inputs#model-inputs), [pinned model implementation](https://github.com/angular/angular/blob/61fe5ca/packages/core/src/authoring/model/model_signal.ts).

## Remaining verification and decision

No API dead end requires changing the user's architecture now. Prefer the current public custom-set projection with one authoritative root; retain whole-root form binding as the stricter alternative. The parent must clarify the meaning of “one” only if choosing between these interpretations affects acceptance; this research does not authorize replacing the root with section signals.

Before implementation acceptance, verify the selected package declarations, compile strict form/template types for the actual editor payloads, and test nested `set`/`update`, root-driven draft replacement, unrelated root changes, Save/Cancel isolation, and stale-session writes. Confirm resetting interaction state and any pending validation/control updates across editor transitions. These tests were not performed here; upstream tests and source inspection establish feasibility, not PawTrace correctness.
