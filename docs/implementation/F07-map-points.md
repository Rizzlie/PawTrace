# F07 — Named map points and place roles

Status: planned
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

To be filled during implementation.
