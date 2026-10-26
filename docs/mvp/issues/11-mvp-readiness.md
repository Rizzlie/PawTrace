# MVP readiness and first-release boundaries

Parent: ../map.md
Label: wayfinder:grilling
Type: grilling
Status: resolved
Assignee: macsy
Blocked by: 05, 06, 10, 12

## Question

Context: [Interface layout and map workflow](05-map-workflow.md), [JSON contract for case transfer and later analysis](06-json-contract.md), [Local MVP architecture and technical trade-offs](10-local-architecture.md).

How will we know the specification is ready for implementation, and which scenarios should later confirm that the MVP works? Agree on the minimum complete flow: local Docker startup, a new case and optional profile, positioning named points, several history-entry types, two basemaps, areas and checks, photos and previews, browser restoration, and JSON export/import without data loss. Define critical errors and validation (JSON file, required names/positions/geometry, unavailable resources and location permission), minimum control accessibility, and the boundary of phone testing given desktop priority. Confirm that photos are included while other attachment types are not required. Establish an implementation sequence as a plan, without implementation or commits. This ticket closes the remaining scope boundaries rather than adding new product features.

## Comments

The user accepted validation requiring a point name and position and valid area geometry, while profile and event time remain optional. Import, photo, and service errors must not lose the case; controls need labels, visible focus, and appropriate sizes. MVP attachments are photos only, without video, audio, or documents.

They corrected the priority: phone support follows the finished desktop browser version. They chose Nx + Angular + Leaflet, ruled out GUGiK, and expect satellite tiles. The complete acceptance scenario remains unapproved with respect to the changed basemap and awaits [Choosing satellite tiles for Leaflet](12-satellite-provider.md). Do not treat the Q1 response as approval of the previous GUGiK scenario.

The satellite provider was subsequently resolved: OSM + Mapbox Static Tiles in a card-free trial. Final confirmation of the corrected acceptance scenario and work sequence remained. The no-commits instruction still applies.

## Answer

The user accepted the final implementation sequence. Scope and acceptance criteria follow earlier confirmations and corrections: Nx + Angular + Leaflet, OSM/Mapbox basemaps, and desktop as the first stage. Do not return to GUGiK or the earlier stack. Planning is complete; this is not a claim that a working application is ready.

### Implementation sequence

1. **Docker and map.** An Nx workspace with an Angular application and Leaflet; local Docker Compose startup and a map view switching between OSM/Mapbox. An early, small integration check of basemaps and manual address search. Configure the Mapbox account and token during implementation; they were not obtained during planning.
2. **Data model and JSON.** Profile and escape circumstances, stable identifiers, explicit uncertainty and time types, automatic browser saving, export, and validated import. Develop restoration mechanisms from the start, not only at the end.
3. **Points and history.** Named places, position selection through click/marker/address, roles, multiple history entries, observations/actions/checks/notes, rejection status, and repositioning without losing history.
4. **Areas.** Circles and polygons, plans and repeated actual checks, results and searched-part geometry, confirm/undo/cancel editing.
5. **Photos.** Local server and persistent `data/assets` directory, originals, thumbnails, and full-resolution HEIC previews, filename links in JSON, errors and processing retry without data loss.
6. **Filters and interface refinement.** Green design with floating collapsible panels, overlapping-point selection, newest-first history, filters retaining context, confirmed deletion, empty states, and messages.
7. **Complete acceptance.** The full flow and error checks below. Phone support follows the finished desktop version.

### Acceptance scenario

- Start on a desktop through Docker following the project instructions.
- Create a case from an empty map without requiring a complete profile; allow later completion of animal and escape information.
- Add and edit named points, select positions on the map and by address, assign roles, keep several entry types in the history, and reject a specific observation with a reason.
- Switch between OSM and Mapbox satellite imagery, with visible attribution and source-unavailability handling that does not lose the case.
- Draw a circle and polygon, correct and cancel geometry, and record multiple checks of the same terrain, including only part of a planned area.
- Add multiple photos, view thumbnails and detailed previews, download originals, unlink without deleting assets, display derivative-generation failures, and retry.
- Restore the case after refreshing and reopening the browser.
- Export and import the complete case without losing identifiers, roles, entries, statuses, uncertainty, dates, geometry, photo filenames, or view settings. Restore photos when assets are available; retain references when they are not.
- Filters do not exclude export data. Opening a point retains the context of its full history and highlights matching entries; rejected observations can be shown.
- Delete an entry or a point with its history according to the agreed confirmations; warn and offer export before replacing a case through import/new-case creation.
- Restarting or recreating a container with the same asset directory retains photos. The documented backup includes JSON and the asset directory.

### Validation, errors, and accessibility

- A point requires a name and valid position; an area requires valid geometry. An incomplete profile or unknown event time does not block map use.
- Invalid JSON, unsupported versions, inconsistent identifiers, and broken relationships do not overwrite the current case. Explain the problem while leaving local storage intact.
- A failed automatic save retains the newest in-memory changes and the last successfully persisted version, displays a persistent unsaved state, and leaves manual JSON export available. Never display successful saving for a failed write.
- A missing photo does not block import; upload, derivative, or resource errors do not remove entry text. A successful original with a failed thumbnail remains attached.
- No address result, denied location permission, network errors, or unavailable Mapbox access do not lose saved data. Manual position selection remains available.
- Controls have labels and visible keyboard focus; save/cancel actions are unambiguous. Basic forms and panels do not require perfect targeting of tiny icons.
- First-release testing focuses on the desktop browser. Refinement of the phone version, physical gestures on target devices, and local HTTPS certificates follows later; it is not a gate for this stage.

### Additional acceptance cases from plan refinement

- At one point, create confirmed-target, uncertain, and different-animal observations. Verify the separate identification outcomes survive export/import, all three counts are correct, and different-animal sightings remain visible with a distinct presentation. Do not automatically classify them as manually rejected reports.
- Apply a time filter and verify counts use only matching entries; opening the point retains the full history and highlights matches. Verify that an older confirmed sighting is not counted as a recent observation. Existing unknown-time filter behavior still applies.
- Use predefined point roles without a custom-role editor. Retain multiple reports as separate entries without same-event grouping, deduplication, or food-placement/check links.
- Force automatic-save failure. The newest in-memory case remains exportable, the previous successful stored version remains intact, and the unsaved indicator persists until a successful save. No MVP multi-tab edit lock is required.
- Record finding and securing the animal; the case remains editable and exportable without a separate closing workflow.
- For a multi-image/animated input, verify one still primary-image preview and the downloadable unchanged original. Frame browsing and animation playback are outside the required scope.
- In the actual NestJS Linux image, verify HEIC decoder availability, thumbnails and full-resolution previews, preserved original bytes, processing retry, and survival of original references after derivative failure. The research is not a substitute for these checks.

### Stage boundaries

Attachments are photos only. Video, audio, and documents are not required. Other exclusions remain in the map. The plan does not start implementation or authorize commits; the explicit prohibition on new commits still applies.
