# Interface layout and map workflow

Parent: ../map.md
Label: wayfinder:prototype
Type: prototype
Status: resolved
Assignee: macsy
Blocked by: 01, 02, 03, 04, 07

## Question

Context: [Case lifecycle and safe file saving](01-case-files.md), [Animal profile and escape circumstances](02-animal-profile.md), [Meaning of map points and areas](03-map-records.md), [Map use in the field and on desktop](04-map-capabilities.md).

Photo support also depends on [Server photo handling](07-photo-assets.md).

Binding model clarification: a point is a named place with multiple roles and multiple history entries (observation, action, check, note). The prototype should demonstrate adding an entry to an existing point, not just creating new markers.

Agreed map features include two basemaps, address search, location on demand, measurements, filters, and phone editing. Refine how point-role, entry-type, event-time, and rejection filters combine; how points without matching entries or without history behave; how entries with unknown times are presented; and how overlapping objects are selected. Hiding rejected observations must not hide other matching entries at the same point. Geometry editing should support confirm, undo-step, and cancel independently of normal map panning.

How should the interface look and work on desktop and phone? Prepare a cheap prototype to discuss with the user, covering case creation, profile completion, adding an observation and a hiding place, drawing and correcting an area, recording a search result, and saving and reopening a file. Define the relationship between map, forms, and entry list, overlapping-object selection, and first-version boundaries. The prototype supports a decision; it is not a product implementation.

## Comments

### Prototype for discussing the layout

Asset: [PawTrace — three layout variants](../prototypes/pawtrace-ui-prototype.html). A standalone HTML file with no dependencies or persistent storage; opened directly in a browser. Supports `?variant=A`, `B`, or `C`, an arrow switcher, and a phone preview.

- A: place list, map, and history as three panels; switchable views on a phone.
- B: map with an overlaid history panel and an on-demand list.
- C: place journal beside the map; map above history on a phone.
- In-memory interactions: select a point, add a point, add a history entry, choose layout and device. Profiles, filters, case files, and area editing show proposed flows without service integrations. The map is a schematic with fictional data.
- Verification with `html_preview`: desktop A/B and mobile C, no script errors in these runs; adding an entry updates the history; mobile C fits a 360 px width.

Awaiting user feedback. The ticket remains claimed and unresolved. After selection and completion of prototyping, preserve the source on a throwaway branch as required by the prototype skill and add a context pointer; do not promote this code into the product.

### User correction and combined A+B variant

- The user wants maximum map visibility and a combination of A and B. The place list and history should float above the map as separate panels inset from the edges, without reducing the map area or making the panels themselves draggable.
- They expect a pleasant, polished appearance; the green palette was accepted as the direction.
- Adding a point: “Add point,” choose a position on the map, optionally drag the marker or search for an address, then save the point. The form must not assign an arbitrary position without allowing a choice.
- History: newest events at the top.

New asset: [PawTrace — map with floating panels](../prototypes/pawtrace-floating-prototype.html). The map occupies the entire workspace; panels collapse and have fixed positions above the map. On a phone, the list is collapsed by default and history is a bottom panel. While setting a position, panels make room for the map and point form.

Prototype interactions: clicking the map sets the position; the marker supports mouse or touch dragging; the address field offers three explicitly sample results without real geocoding; saving and cancelling work in memory. An existing point can be repositioned without losing its history. The schematic uses percentage positions; the real application will store geographic coordinates.

Verification with `html_preview`: desktop at 1000 px and phone at 360 px; an additional 728 px run checked click positioning, point saving, address selection, cancelling an edit, and repositioning an existing point while retaining history. No script errors in these runs. Dragging was added in code; this run did not include a real mouse or touch gesture. Variant selection and further interface rules await user feedback; the ticket remains claimed.

### Visual direction accepted

The user confirmed that the combined A+B layout in `pawtrace-floating-prototype.html` and the green styling meet their expectations. Accepted direction: a map filling the workspace, separate collapsible panels above it without panel dragging, point positioning and correction through the map or an address, and newest-first history. Detailed rules for overlapping-object selection, filtering, and deleting points and entries remain. This is partial acceptance within the current ticket, not the final specification of the entire interface.

## Answer

The user approved the visual direction and the final interaction rules.

- The accepted layout combines A and B: the map fills the workspace, while named places and the selected place's history are separate collapsible panels floating above it. Panels are inset from the edges, do not narrow the map, and are not draggable. On a phone the list is collapsed by default and history appears in a bottom panel.
- Styling: pleasant and polished, with the green palette accepted in the revised prototype.
- Adding a point: a separate action, choose a position on the map or search for an address, optionally drag the marker, provide a name and roles, then confirm or cancel. Repositioning an existing point retains its history. Search outside this mode does not automatically create a point.
- Adding an entry: select a place and add to its history; the entry type determines the relevant fields. The profile, case files, and areas are accessible from controls above the map, and saving/editing flows respect the other map decisions.
- History defaults to newest events first. Entries with an unknown time go into a separate “Unknown time” section.
- Clicking overlapping points shows a small list of names to choose from, without repeatedly zooming in.
- Filters narrow the places on the map and list. Selecting a place shows its entire history, highlighting matching entries so earlier actions remain in context. Rejected observations are still hidden by default, with an option to show them. Date-range filtering includes an “Include entries with unknown time” option.
- Individual entries and whole points can be deleted. Deleting a point includes its history and requires confirmation showing the entry count. Photo files remain on the server under the unlinking rule. Reports can be manually rejected with a reason, independently of animal identification.
- Observation identification has three outcomes: confirmed target, uncertain, and excluded/different animal. Different-animal observations remain visible on the map, with a distinct visual treatment. Each point shows counts for all three outcomes while its history preserves each entry's assessment. Do not equate an excluded identification with hidden or deleted data.
- Point observation counts are computed from entries matching the active filters, including event time. Opening a point still shows the full history with matching entries highlighted. Do not let an older confirmed observation contribute to a count labeled as a recent filtered result.

### Preserved prototype

The original variants and accepted direction were preserved on the local branch `prototype/pawtrace-ui`, commit `995e04d` (no PR and no merging of prototype code into `main`). Files on that branch: `docs/mvp/prototypes/pawtrace-ui-prototype.html` and `docs/mvp/prototypes/pawtrace-floating-prototype.html`. Working copies in local `.scratch/` remain available for preview and are not tracked on `main`.

The prototype is reference material, not an application implementation. The map and geocoding are demonstrations, storage is in memory, and some forms only illustrate a proposed flow. Future implementation must reproduce the agreed behavior using a real map and data.
