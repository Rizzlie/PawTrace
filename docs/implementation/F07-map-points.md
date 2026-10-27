# F07 — Named map points and place roles

Status: done
Depends on: F02, F03, F04, F05, F06

## Goal

Create, select, reposition, and remove named places on the real map, with predefined roles and one canonical escape location.

## Read first

- [Frontend architecture](../architecture/frontend.md), including library boundaries, editor ownership, and JSON/persistence flows.
- [Execution guide](README.md), [F03](F03-address-search.md), [F04](F04-domain-and-json-contract.md), and [F06](F06-animal-profile.md).
- [Map-point semantics](../mvp/issues/03-map-records.md).
- [Interface workflow](../mvp/issues/05-map-workflow.md) and [floating-panel reference](../mvp/prototypes/pawtrace-floating-prototype.html).

## Scope

1. Implement Add point as an explicit map-editing mode: choose a location by click or submitted address search, drag the candidate marker, give the place a name and predefined roles, then save or cancel.
2. Keep candidate geometry separate from the saved point until confirmation. Searching outside point-editing mode still only moves the map.
3. Add a floating, collapsible place list and point selection. Support points with multiple roles or no roles; custom-role creation is outside scope. “Animal seen” is derived from observations in F08, not a manually competing identification on the point.
4. Connect the single escape-location assignment to the profile/incident reference. Repositioning a point corrects the whole place and retains its ID and any imported history.
5. Provide point removal with confirmation including the history-entry count. Maintain valid references when removing the escape point or a point referenced by other records, without deleting unrelated records or server assets.
6. Make overlapping points selectable by their names instead of requiring repeated zooming.

## Acceptance criteria

- Click, drag, and address-result selection produce correct geographic coordinates and a required name.
- Cancelling creation/editing leaves saved data unchanged; ordinary map navigation never edits a point.
- Moving or renaming preserves identity and imported history; only one point is the canonical escape location.
- Floating panels can collapse without reducing the map canvas size.
- Deletion leaves a valid exportable case, with photo files untouched. Overlapping points remain selectable.

## Validation

Create a point by map selection and another by address; cancel a third. Reposition a fixture point with history, reload, and export/import it. Test overlap selection, escape reassignment/deletion, and deletion cancellation. Verify no screen-percentage positions enter JSON.

## Architecture integration

Coordinate form and draggable marker through one editor session. Address lookup and map placement update draft geometry; Save commits, Cancel restores existing geometry or removes the new unconfirmed marker. Switching dirty editors follows Save / Discard / Stay.

## Completion notes

Implemented named point creation by map click/address selection, draft dragging, coordinate correction, zero/multiple predefined roles and explicit Save/Cancel. A collapsible place list and named overlap chooser retain the full map canvas; phone lists start collapsed. Editing retains IDs and imported history/photos. Escape assignment uses the existing single incident reference.

Removal confirmation shows the history count. Removing a point removes its entries and clears escape/observation references, retaining unrelated records and all assets. A linked check whose observation is deleted becomes `other_or_inconclusive`; its description preserves the sighting and removed observation ID. This maintains the existing strict JSON v1 invariant without dangling references or deleting checks.

Shared `withEditorLifecycle` / `EditorTransition` owns transitions and aborts delayed Saves. Focused animal/point features own draft conversion and validation. Signal Forms and map placement share one session-scoped draft. Scene/UI data are computed; side effects stay in form/navigation/storage/Leaflet adapters. Profile activation tears down pending decisions on superseding navigation. Address-search help keeps a stable layout while results are selectable.

TDD: the first point-state test failed before implementation, map placement/overlap tests failed before integration, deletion validation caught the linked-check result invariant, and two delayed point-Save cancellation regressions failed before the shared lifecycle fix. All focused regressions now pass.

Independent Standards and Spec reviews against task-start `ba199bb` found cancellation, guard teardown and mobile-default issues in round 1; round 2 confirmed them corrected, with no remaining documented-standard or spec findings. One nonblocking design suggestion notes similar validation sequences in the focused editors; no speculative helper was introduced.

Validation: command-scoped `BASE_URL=http://127.0.0.1:4200` with `npm exec nx run-many -- -t typecheck lint test build e2e --output-style=static` passed all 25 tasks across eight projects, including both builds, 35 workspace regressions, 30 map-engine tests, and all 52 Chromium scenarios. Six new browser scenarios cover click/drag/address placement, cancellation, roles, preservation/reload/JSON transfer, overlap selection, escape reassignment/removal, deletion cancellation, dirty transitions and phone collapse. Screenshots at 1280px and 390px were inspected. `git diff --check` passed.

The first full run passed 51/52 browser scenarios; the new creation test exported before asynchronous Save completed. Waiting for the editor to close corrected test synchronization; the final full run passed 52/52. The export behavior was correct throughout: unconfirmed drafts are excluded. F02 live Mapbox acceptance remains separately blocked and was explicitly waived for F07 by the user. No paid service or server photo operation was used.

### Standards review

No documented-standard breaches remain after round 2. One low-priority judgment call notes duplicated validation sequences in profile and point Save; this is not a blocker.

### Spec review

No missing/partial requirements, scope creep or incorrect F07 behavior identified after round 2. The initial cancellation and mobile-default findings are resolved.

### Toolbar placement

The point-creation button lives in the right map-actions toolbar with device location, independently of the collapsible place list. The application supplies availability and handles the creation intent, including routed profile exit. Mobile acceptance checks that Add point remains available while the list is collapsed and that ArrowDown moves focus from device location to point creation. Map messages and the editor sit below the expanded toolbar.

Validation after toolbar placement: the selected Nx typecheck/lint/test/build/e2e run passed all 14 tasks (including dependencies), 35 workspace regressions, 30 map-engine tests and all 52 Chromium scenarios. The 390px screenshot confirms both actions remain visible above the point editor.

### Selected-place panel

Following `pawtrace-floating-prototype.html`, selected-place information is a separate floating panel anchored at the bottom right, with a close control and constrained scroll height. The left panel contains only the place list. Details remain visible when the list is collapsed; phone layout uses the available width above map controls and collapses the place list when a place is selected, as in the prototype. The panel is nonmodal so map navigation remains usable. During editing, details yield to the editor; selecting another place resolves Save / Discard / Stay before opening its details.

Validation after selected-place panel refinement: all 11 selected Nx typecheck/lint/test/build/e2e tasks passed, including all 54 Chromium scenarios. New 1280px/390px checks verify bottom-right anchoring, an independent collapsible list, close/reopen behavior and unchanged map canvas dimensions. Both screenshots were visually inspected.

### Place numbers

Place-list rows, map markers and overlapping-place choices share one-based display numbers from the committed point order. The computed map scene is also the list projection; existing-point drafts retain that display number and a new draft previews the next number. Removal renumbers remaining places without changing IDs or adding fields to JSON. Leaflet updates marker labels when a number changes while retaining the marker instance. A regression first failed with empty marker text, then passed after numbered marker rendering and reconciliation were implemented.

Validation after numbering: frontend typecheck, lint, unit tests and build passed (including 31 map-engine and 35 workspace tests). A frozen-source rerun passed all 55 Chromium scenarios, including matching list/marker numbers, renumbering after removal, unchanged point IDs/JSON and restoration after reload. The initial browser run overlapped formatter-triggered development reloads; the clean rerun passed.
