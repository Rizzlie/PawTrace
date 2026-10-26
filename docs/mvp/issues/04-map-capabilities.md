# Map use in the field and on desktop

Parent: ../map.md
Label: wayfinder:grilling
Type: grilling
Status: resolved
Assignee: macsy
Blocked by: none

## Question

What map capabilities does the first version need beyond annotations? Determine the need for address search, moving to the current location, different basemaps, distance measurements, and filtering. Is offline use a first-version requirement, and if so, which activities must work? Define touch-interaction boundaries when drawing and correcting areas. This is a decision about product needs; comparing specific map services is later research.

## Answer

The user accepted all six map-feature recommendations.

- Address and town search and a “My location” button. Search results reposition the map; they do not automatically create a point. Device location is obtained on demand, without continuous tracking.
- Two basemaps: a street map and satellite or aerial imagery. Availability, coverage, and usage terms require later provider verification.
- Straight-line distance measurement between selected places and area measurement. Also show the radius of circles. No walking-route calculation in the MVP.
- Map and entry-list filters: point roles, history-entry types, event time, and rejection status. Rejected observations are hidden by default, with an option to show them. This does not remove data from the case or JSON export.
- Later clarification: an excluded identification (a different animal) is not automatically a manually rejected observation. Different-animal sightings remain visible and have a distinct map presentation; the default hiding rule for manually rejected reports must not hide them simply because of their identification outcome.
- The MVP requires internet access to start the application and use maps and photos. Full offline mode is not required. Local automatic case saving still applies.
- The phone supports point creation and correction and area drawing and correction. Editing has a separate mode with confirm, undo-step, and cancel actions so panning the map does not change data.

Filter presentation and combination, no-result behavior, and touch interactions belong to [Interface layout and map workflow](05-map-workflow.md). Cost criteria and geographic coverage for provider comparison are defined in [Constraints for map services and hosting](08-service-constraints.md).
