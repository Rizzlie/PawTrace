# Case JSON v1

Implemented by `libs/shared/case-domain`, exported as `@pawtrace/case-domain`. This reference concretizes the accepted [JSON decisions](../mvp/issues/06-json-contract.md) and [frontend architecture](frontend.md). The strict Zod schemas and checked-in [complete example](../../libs/shared/case-domain/src/fixtures/complete-case-v1.json) define the executable contract.

## Document and file

A committed document has exactly `schemaVersion: 1`, `case`, `animal`, `points`, `areas`, `assets`, and `mapView`. An exported file has the same fields plus required `exportedAt`. Import consumes this timestamp; it is never part of the stored document. Export validates first, preserves all committed records, adds the caller's timestamp and formats with two-space indentation. It performs no writes and does not change factual metadata.

No coercion, trimming, implicit defaults, date revival, or unknown-field stripping occurs. Every object is strict, including union variants, optional details, coordinates, captions and assets. Unknown root or nested fields fail validation. Fields are English; text preserves the author's language. Unknown individual values use `null`; empty or whitespace-only text is rejected, as is text containing U+0000 or a lone UTF-16 surrogate, which PostgreSQL text cannot store faithfully. `false` is a recorded negative answer; `[]` means no recorded elements. The entire `animal` may be `null`; every profile field may be omitted while completing it gradually. Present individual profile answers may also be `null`.

Stable nonblank text IDs identify the case, points, all point-history entries, areas, and area checks. IDs must be globally unique within the document, including across record kinds. Callers generate IDs; the contract does not generate or rename them. Names and list positions are never identifiers. Deleted records are absent; rejected observations remain. Observation counts, escape roles and sighting roles are derived. UI filters, drafts, selection, panel positions, save state and local revisions are outside this format.

## Case and animal

`case` contains `id`, `title`, `createdAt`, `updatedAt`, `timeZone` and `escape`. The time zone must be recognized by the runtime's `Intl` implementation, for example `Europe/Warsaw` or `UTC`; its original spelling is retained. New-case creation will choose the device zone in F05. Metadata timestamps are supplied by application commands, not inferred from event time.

`escape` contains `occurredAt`, `escapePointId`, `description`, `directionOfTravel` and nullable boolean `familiarWithLocation`. `escapePointId` is `null` or an existing point ID. The point owns the only copy of its name and coordinates. There is no independently editable escape role.

Optional profile fields:

- Basics: `name`, `species`, `breed`, `sex` (`female`, `male`, `intersex` or `null`), `neutered`, `age`, `weightKilograms`.
- `age`: `{ value, unit: "months" | "years", approximate: boolean }` or `null`. Value is nonnegative, with no invented birth date. Known weight is positive.
- Identification: `coatColor`, `coatPattern`, `size`, `distinguishingFeatures`, `collarHarness`, `microchipped`, `microchipNumber`.
- Health: `illnesses`, `injuries`, `mobilityLimitations`, `sensoryLimitations`, `medication`.
- Behavior: `temperament`, `reactionsToPeople`, `reactionsToAnimals`, `fears`, `responseToCalls`, `attractionMethods`, `favoriteFood`.
- Habits: `outdoorAccess` (`indoor_only`, `supervised`, `unrestricted` or `null`), `familiarWithArea`, `usualRoutes`, `usualPlaces`, `previousEscapes`.
- `additionalInformation`, `photos`, `mainPhoto`, `photoCaptions`.

`neutered`, `microchipped` and `familiarWithArea` are nullable booleans. Other descriptive fields are nullable text; `previousEscapes` retains a description rather than inventing a count. Species and size remain free text for different animals. `mainPhoto` is `null` or a filename in profile `photos`; each `{ filename, caption }` in `photoCaptions` also refers to that list, with at most one caption per filename. No server metadata or file availability is required for these references.

## Event time

All variants require nullable `description`, preserving the original verbal account:

- `exact`: `at` is an ISO date-time with `Z` or an explicit UTC offset.
- `approximate`: the same `at` representation with explicit approximate precision.
- `range`: nullable `start` and `end` date-times; at least one is known. A known end cannot precede the start when compared as instants, including across offsets and daylight-saving transitions.
- `date`: `date` is a valid `YYYY-MM-DD` calendar date, without an invented midnight.
- `unknown`: no timestamp or date, only the original description.

The discriminator is `kind`. “In the evening” can remain a date plus description, or unknown time plus description if the day is unknown. Creation time never substitutes for event time. Case time-zone context is separate from each known instant's offset.

## Points and history

Each point has `id`, `name`, `coordinates`, `roles`, nullable `description`, `photos` and `entries`. Coordinates are `{ latitude, longitude }` in degrees, bounded by ±90 and ±180. Predefined roles are `potential_hiding_place`, `feeding_location`, `trail_camera`, `other`; each occurs at most once. Escape and animal-sighting presentations follow the canonical escape reference and observation history. Moving a point updates the place shared by its entire history.

Point history has discriminator `type`: `observation`, `action`, `check` or `note`. Every entry contains `id`, `occurredAt`, `createdAt`, `updatedAt`, nullable `description`, `status`, `rejectionReason` and `photos`.

Observations additionally contain:

- `source`: `personal_observation`, `another_person`, `surveillance`, `other` or `null`, and nullable `sourceDescription`.
- `uncertaintyRadiusMeters`: a positive number or `null`, distinct from search-area geometry.
- `identification`: `target_animal`, `different_animal` or `uncertain`. This never changes rejection status automatically.

An observation has `status: "active"` with `rejectionReason: null`, or `status: "rejected"` with a nonblank reason. Other history types have `status: "active"` and `rejectionReason: null`. Manual report rejection applies to observations, not a place or its other history.

An action's `details` is `null` or a strict object with optional fields: nullable `kind` (`food_placement`, `food_refill`, `trail_camera_setup`, `other`), nullable `foodType`, and nullable `foodQuantity`. Known quantity is `{ value, unit }`, with positive value and unit `grams`, `kilograms`, `milliliters`, `liters` or `portions`.

A point check has nullable `result`, `observationEntryId`, `method` and `details`. Check details may contain nullable `foodStatus`: `present`, `partially_eaten`, `absent`. Unknown is `null`. Food status does not assert an animal's presence or invent an event time. There is no food-action link or report-grouping structure.

Check results (shared with area checks): `no_animal_or_signs`, `possible_signs`, `animal_seen`, `animal_secured`, `unable_to_check`, `other_or_inconclusive`; `null` is an unknown result. `animal_seen` requires an `observationEntryId` identifying an existing point-history observation anywhere in the case. Other results require `null`. A referenced report is retained once in point history; different-animal or manually rejected reports are not silently rewritten. Source and identification remain on the observation.

## Areas and geometry

An area has `id`, `name`, nullable `description`, `photos`, nullable `plannedGeometry` and `checks`. A missing plan allows a search recorded without prior planning. Each area check has `id`, `occurredAt`, `createdAt`, `updatedAt`, nullable `description`, `photos`, `result`, `observationEntryId`, `method` and required `actualGeometry`. Check results and links follow point-check rules. Actual searched terrain is a snapshot independent of later plan changes; it need not equal or be contained by the plan. Repeated checks have separate IDs and times. Method/process notes are free text; there are no structured duration, thoroughness or access fields.

Geometry uses discriminator `type`:

- `circle`: `center` coordinates and positive `radiusMeters`.
- `polygon`: `vertices`, an ordered open ring of at least three distinct coordinates. The implicit final edge returns to the first vertex; do not repeat that vertex. Either winding and simple concave rings are valid. Zero-area, repeated-vertex and self-intersecting/touching rings are invalid. There are no holes or multiple rings in v1. Intersection checks use longitude/latitude segments for the Poland search workspace, without coordinate conversion or stored screen positions.

All numbers must be finite. Dimensions name their units explicitly. Measured area and derived summaries are not additional authoritative fields.

## Assets and map view

Every `photos` field is a unique list of original server filenames, without paths, URLs, query fragments, control characters, or embedded image data. Lists have no product-level count limits. References without asset metadata remain valid: unavailable server files do not invalidate import.

`assets` contains metadata records with `filename`, nullable `originalName`, nullable image `mediaType`, nullable nonnegative integer `sizeBytes`, nullable positive integers `widthPixels` and `heightPixels`, and nullable `thumbnailFilename` and `previewFilename`. The original stays unchanged; a compatible still preview supports formats such as HEIC. No frame browsing, binary data, inferred event details or cleanup is stored here. Filenames across originals and derivatives must be unique. A known derivative cannot be used in a `photos` list in place of its original. Metadata does not prove availability and does not impose a photo-size cap.

`mapView` contains `center` coordinates, finite `zoom` from 3 through 22 (matching the current map adapter), and `basemap: "osm" | "satellite"`. It is separate from incident facts and never restricts export. Storage, file pickers/downloads, replacement confirmation and autosave orchestration belong to F05; profile and history editing follow in F06–F10.
