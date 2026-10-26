# Animal profile and escape circumstances

Parent: ../map.md
Label: wayfinder:grilling
Type: grilling
Status: resolved
Assignee: macsy
Blocked by: none

## Question

Exactly what information describes the animal and the disappearance incident in the first version? Define fields shared across species, species-specific fields, units, dates, optional fields, and the distinction between “I don't know” and a negative answer. Consider an indoor cat, a dog escaping in an unfamiliar area, and unknown exact age or escape time. Define the role of free text and any photos, without assuming in-app AI analysis.

## Comments

### Partial agreements — 2026-10-26

The user accepted:

- All profile fields are optional; work can begin on the map. A missing answer means unknown, not a negative answer.
- The profile includes name, species, breed or type, sex, neutering/spaying status, age (including approximate age), weight; coat color/pattern, size, distinguishing features, collar/harness, and microchip information; illnesses, injuries, mobility or sensory limitations, and medication; temperament, reactions to people and animals, fears, response to calls, and known ways of attracting the animal; outdoor access, familiarity with the area, usual routes and places, previous escapes; and additional free text.
- Escape circumstances are recorded separately: exact or approximate time, location on the map, description of the situation, possible direction of travel, and the animal's familiarity with the location. Time and location may remain unknown.

The user requires photos in the MVP and emphasized their importance. Files should be stored on the server as assets; restricting access to the signed-in user is planned for later. The number and context of photos and how JSON export/import relates to server files still need clarification. The ticket remains open and claimed until the discussion is complete.

### Photo clarification — 2026-10-26

The user accepted multiple profile photos, a main-photo selection and captions, as well as photos attached to observations, hiding places, and search areas. They clarified that observation data stays on the observation and its `photos` field should initially contain only filenames, rather than full URLs or images embedded in JSON.

## Answer

### Animal profile

- All fields are optional. The profile can be completed gradually while working on the map immediately. An unknown value is not a negative answer.
- Basics: name, species, breed or type, sex, neutering/spaying status, age (including approximate age), and weight.
- Identification: coat color/pattern, size, distinguishing features, collar/harness, and microchip information.
- Health: illnesses, injuries, mobility or sensory limitations, and medication.
- Behavior: temperament, reactions to people and animals, fears, response to calls, and known ways of attracting the animal, including favorite food.
- Habits: outdoor access, familiarity with the area, usual routes and places, and previous escapes.
- Free text for additional information.
- Multiple photos, a main-photo selection, and captions.

### Escape circumstances

A record separate from the profile: exact or approximate time, location on the map, description of the situation, possible direction of travel, and the animal's familiarity with the location. Time and location may remain unknown.

### Photos attached to entries

- Photo support is a required part of the MVP scope, but adding a photo to a particular entry is optional.
- Multiple photos can be linked to an observation, hiding place, or search area.
- Observation data is stored on the observation; its `photos` is a list of server filenames. Observation data is not repeated for every photo.
- Images reside on the server as assets. JSON contains references to files, not their contents. The case file requires these assets to be available in order to restore the photos.
- The user plans to restrict photo access to the signed-in user at a later stage.

Boundaries for subsequent decisions: [Server photo handling](07-photo-assets.md) defines the file lifecycle and filename resolution; [JSON contract for case transfer and later analysis](06-json-contract.md) refines field representation, units, dates, unknown values, and profile-photo metadata. Map-entry types and rules remain in [Meaning of map points and areas](03-map-records.md).
