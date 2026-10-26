# JSON contract for case transfer and later analysis

Parent: ../map.md
Label: wayfinder:grilling
Type: grilling
Status: resolved
Assignee: macsy
Blocked by: 01, 02, 03, 07

## Question

Context: [Case lifecycle and safe file saving](01-case-files.md), [Animal profile and escape circumstances](02-animal-profile.md), [Meaning of map points and areas](03-map-records.md).

Photo references must account for [Server photo handling](07-photo-assets.md).

The contract must retain the point name, its multiple roles, and the point-to-many-history-entries relationship (observation, action, check, note). Rejection status and its reason belong to the specific observation, independently of identification confidence. The escape location in the incident profile and on the map must not be independent copies.

What JSON contract preserves the complete case and allows restoration without information loss? Define identifiers, format versioning, coordinates and geometry, dates and time zones, units, unknown values, data provenance, and the distinction between observations and hypotheses. What is case data and what is a map-view setting? How should import handle an invalid file or unsupported version? Consider future database migration and readability for an external LLM, without designing the analysis itself.

## Comments

### First round of JSON decisions

The user accepted:

- Actions and checks have optional structured details in addition to a description, such as food type and quantity and food status during a check (present, partly eaten, absent).
- Event time distinguishes an exact moment, an approximate moment, a range, a date only, and unknown time; the original description is retained. The case has a time zone taken from the device by default. Descriptions such as “in the evening” are not converted into an invented hour.
- Moving a point corrects the location of the entire place and its history. An observation at another place belongs to another point.
- Invalid JSON or an unsupported version stops import without changing the current case, with an error message. A missing server photo does not block import.
- A separate part of the file stores map center, zoom, and basemap. View settings do not restrict exported data.

Technical proposals presented in this round: English field names, a format version number, and stable identifiers independent of a place's name. The complete export also includes rejected and hidden entries, and `photos` remains a list of filenames, as previously agreed.

The user explicitly prohibited further commits for now; this is recorded in the map's Notes. Do not create commits when finalizing the contract.

## Answer

### File scope and organization

One JSON file contains one case and all its data, regardless of current filters. It includes rejected observations and retained references to unavailable photos. It does not contain image data or AI-analysis results. Use readable indentation and Unicode text.

Field names and enumerated values are English; user-entered content remains in its original language. The format has `schemaVersion`, initially `1`. The case, points, areas, and entries have stable application-generated text identifiers, retained across export/import and renaming. A label or list position is not an identifier.

Proposed contract sections for implementation:

- `schemaVersion`, `exportedAt`: format version and export time.
- `case`: identifier, title, creation and update times, time zone, and escape circumstances.
- `animal`: optional profile fields agreed in [Animal profile and escape circumstances](02-animal-profile.md), photos, main photo, and captions.
- `points`: named places with an identifier, coordinates, roles, description, and their own `entries` list.
- `areas`: named areas with planned geometry and histories of actual checks, with their own identifiers.
- `assets`: metadata for files resolved by filename, including the original-to-thumbnail relationship. It does not duplicate event information or contain image data.
- `mapView`: map center, zoom, and basemap, separated from facts about the disappearance.

### Relationships and escape location

- Point entries are nested in `points[].entries`; an observation is an entry type, not a new map point.
- Store predefined point roles and per-observation identification assessments. Filter-dependent point counts are derived view data, not independent editable facts persisted alongside history.
- The escape location is the identifier of one point in the incident description (`escapePointId`), or `null` if unknown. Coordinates and name remain on the point. Its escape-location role follows from this relationship rather than creating another independent location or competing assignment.
- Moving a point corrects the location of the entire place and its history. A different place requires a different point.
- An area check retains the actual searched geometry from the time of that check, independently of later changes to the planned area.
- If a check refers to an animal observation, it references the relevant entry identifier; the same observation is not duplicated in two histories.

### History entry

- Common data: `id`, `type` (`observation`, `action`, `check`, `note`), event time `occurredAt`, `createdAt`, `updatedAt`, description, `status`, and `photos`.
- An observation also retains its source, source description, optional location-uncertainty radius, and animal identification. The later user clarification requires three identification outcomes: the target animal, a different animal, or uncertain. Use one identification assessment instead of requiring the earlier four-level confidence field as well.
- Rejection status is stored on the entry, for example `active` or `rejected`, with a separate `rejectionReason`. Animal identification is a separate assessment with confirmed-target, excluded/different-animal, and uncertain outcomes. Rejected reports remain in exports. A different-animal identification does not automatically reject or hide the entry; it remains visible with a distinct map presentation. Point outcome counts are derived from observations rather than a competing editable identification on the point.
- Actions and checks have `details` appropriate to their type: for example food placement, food type and quantity, trail-camera setup, or food status during a check (`present`, `partially_eaten`, `absent`, unknown). The overall search result is separate information using the agreed categories.
- All additional details are optional. Free text preserves context not covered by the vocabulary. Missing food is not automatically an animal observation.
- No food-placement/check relationship or same-event observation-grouping structure is required in the MVP. Keep separate reports and read food context from the point history, as confirmed during plan refinement.
- User-deleted entries and points are not exported as though they still exist; rejecting an observation retains it as an existing entry.

### Time and unknown values

- `occurredAt` is an object distinguishing exact moment, approximate moment, interval, date only, and unknown time. It retains the original verbal description. Variant-specific fields are explicit; missing hours or interval endpoints are not invented.
- Moments with a known time are stored as unambiguous dates with a UTC offset. The case time zone (the device zone by default) is stored separately. A date-only value remains a date without an artificial midnight. Entry creation time does not replace an unknown event time.
- Unknown individual values are `null`, not empty text, zero, or `false`. `false` is an explicit negative answer. Empty lists mean no recorded elements.
- Numeric fields have explicit units in their names or beside their values. Distances and radii: meters; areas: square meters; animal weight: kilograms. Approximate age retains an approximation indicator; a description is not converted into an invented birth date.

### Location and geometry

- A point and a circle center have explicit geographic latitude and longitude fields in degrees, rather than screen positions, an address, or an unlabeled pair of numbers. An address can be an additional description, not the geometry source when reopening.
- Circle geometry retains its center and `radiusMeters`; polygon geometry retains an ordered vertex list. Geometry type is explicit so the correct editing behavior can be restored, not just an approximate appearance.
- An approximate observation retains its uncertainty radius; it is not confused with a planned search area.

### Photos

- `photos` is a list of original-photo filenames on the server, without full URLs, local-device paths, or image data.
- Asset metadata locates an original's thumbnail. The main-photo selection and profile captions remain profile information linked by filename.
- Asset metadata may link the original to a compatible primary-image preview. Multiple-frame/image extraction and playback are not required; filenames still reference the unchanged original.
- Exports retain references to previously saved but currently unavailable photos. They do not contain fictional filenames from failed uploads.
- A missing photo does not invalidate the case. Displaying imported photos requires a server with the corresponding assets; JSON is not a self-contained image backup.

### Import and view settings

- Before replacing the current case, validate JSON syntax, supported version, field types, identifier uniqueness, relationships, and geometry. An error stops import with an explanation; the existing case stays unchanged. Import must not partially overwrite local storage before validation completes.
- Unsupported versions are not interpreted blindly. Future-version migrations are a separate development stage, not an MVP assumption.
- Frontend architecture refinement selected Zod as the shared runtime schema and source of inferred TypeScript document types. A supported-version document with unknown root or nested fields must fail import explicitly; silently stripping unknown data is not allowed.
- A missing server image produces a message at the photo, not an error for the whole import.
- `mapView` restores the last map center, zoom, and basemap. View and filters never exclude data from export. Panel layout and interface-element positions are not facts about the case.

This contract records implementation decisions. No importer, exporter, or formal validator has been implemented. As instructed by the user, no commit of these decisions was created.
