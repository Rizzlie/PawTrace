# Meaning of map points and areas

Parent: ../map.md
Label: wayfinder:grilling
Type: grilling
Status: resolved
Assignee: macsy
Blocked by: none

## Question

What data and rules apply to the escape location, an observation, a potential hiding place, a planned area, and a searched area? Define event time versus entry creation time, information source, identification confidence, and search results. How are approximate locations, time intervals, conflicting observations, and repeated searches of the same area recorded? Are planning and execution separate records or stages of one record? Preserve the distinction between information about an observed event and the user's hypothesis.

## Comments

### Agreed rules — first round

The user accepted:

- An observation includes location, event time, description, source, identification confidence, and photos. Sources: personal observation, another person's report, surveillance recording, other; with an additional source description. Author-assessed confidence: certain, probable, uncertain, unknown. Creation time is automatic and separate from event time.
- Time can be exact, an interval, or unknown; a verbal description is retained without forcing an hour. Observation location is a point with an optional uncertainty radius.
- A potential hiding place is a separate place with a description, photos, and a check history. Each check has a time, result, and note. Identifying a hiding place is not an animal observation.
- The planned area and the history of actual searches are separate information. The same terrain can be checked repeatedly, recording time, result, and method. A negative result concerns a particular check and does not rule out the area for future searches.
- One escape location per case; the map marker and the incident description refer to the same place. It may remain unknown. Subsequent sightings are observations.

Still to clarify: conflicting or rejected observations, area geometry, the extent of the actual search, and the vocabulary of check results.

### Second round and point clarification

- The user confirmed retaining conflicting observations and rejecting them with a reason. Rejection status must be stored on the observation itself, including in JSON.
- They accepted polygon and circle areas, recording the actual searched terrain (all or part of the plan), and searches without a prior plan.
- They accepted check results: no animal or signs seen; possible signs; animal seen (linked to an observation); animal found and secured; unable to check; other or inconclusive result. Checks have notes, photos, and exact or approximate times.
- Key user clarification: one map point has its own name and multiple observations in its history. Example: the cat was seen on October 15 at 15:00, food was put out at 22:00, the food was still there on October 16 at 08:00, and it was gone at 15:00.
- This changes the earlier interpretation of “one observation = one point”: a point is a named place, and events at different times form its history. Distinguish seeing the animal, human actions, and food-status checks, without automatically attributing missing food to the animal being searched for.

The name and types of history entries and their relationship to the previously agreed hiding places, escape location, and checks still need agreement.

### History model confirmation

The user accepted four entry types within a point's shared history and multiple roles for one point, including the escape-location role.

## Answer

### Points and history entries

- A point is a named place with a location and multiple history entries; a single observation does not require its own marker. A point can have multiple roles, such as potential hiding place and feeding location.
- Four entry types: animal observation, action, check, and note. The type is preserved in JSON.
- Each entry has its own event time, description, photos, and status. Creation time is automatic and separate from event time. Event time can be exact, an interval, or unknown; a verbal description is retained without forcing an hour.
- An observation has a source (personal observation, another person's report, surveillance recording, or other, with an additional description). During refinement, the user specified three animal-identification outcomes: confirmed as the searched-for animal, excluded as a different animal, or uncertain. This replaces the earlier four-level confidence proposal. An optional uncertainty radius describes an approximate location.
- Conflicting observations remain in the history. Manual rejection is recorded as the status of a specific observation with a reason, including in JSON. It does not reject the point or other entries. Rejection status is separate from animal identification; a sighting of a different animal is not automatically a rejected report.
- An action describes, for example, putting out food or setting up a trail camera. A check can describe the presence or absence of food or an inspection of a hiding place. A note covers other information.
- Missing food does not automatically mean the searched-for animal was present. Record the state found at a particular time without inventing a cause or an exact disappearance time.
- MVP refinement: do not add explicit links from food checks to particular food-placement or refill entries. Interpret their context from the point history; do not persist guessed associations.
- Retain multiple reports at the same point as separate entries. The user regards their accumulation as information supporting that place; the MVP does not need same-event grouping, deduplication, or report-merging controls. Keep their source and animal-identification information.
- Point roles come from a predefined set in the MVP; user-created roles are not required. “Animal seen” describes observation history rather than asserting that every animal seen there was the target.
- Each point summarizes its confirmed-target, uncertain, and excluded/different-animal observation counts. Individual entries retain their own assessments. Excluded/different-animal sightings remain visible on the map with a distinguishable presentation; do not automatically hide them or treat their presence as confirmation of the target animal.

### Escape location and hiding places

- One escape location per case, as a role of one point. The map marker and the incident description refer to the same information, without independent copies. The location may remain unknown.
- A potential hiding place is a point role with a description, photos, and check history. Identifying a hiding place does not mean an animal observation. Subsequent sightings are separate history entries at the relevant points.

### Areas and checks

- Draw an area as a polygon or a circle with a specified radius.
- The planned area and actual checks are separate information. Searches can be recorded without a prior plan.
- A check retains its time, result, note about the method or process, photos, and the actual searched terrain (all or part of the planned area). The same terrain can be checked repeatedly. Hiding places also have multiple checks in the point's history.
- Results for hiding-place inspections and area searches: no animal or signs seen; possible signs; animal seen (linked to an observation); animal found and secured; unable to check; other or inconclusive result.
- Details of food presence are retained in the check, independently of the overall search result. A negative result concerns a particular check and does not rule out the animal's future presence.
- Do not add dedicated structured fields for search duration, thoroughness, or access/visibility limitations in the MVP. The previously agreed free-text method/process note remains available.

### Further refinement

[JSON contract for case transfer and later analysis](06-json-contract.md) defines identifiers, point-entry relationships, role and status names, dates, geometry, and photo references. [Interface layout and map workflow](05-map-workflow.md) defines history editing and presentation. [Server photo handling](07-photo-assets.md) accounts for photos linked to specific entries.
