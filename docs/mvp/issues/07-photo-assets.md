# Server photo handling

Parent: ../map.md
Label: wayfinder:grilling
Type: grilling
Status: resolved
Assignee: macsy
Blocked by: 02, 03

## Question

Context: [Animal profile and escape circumstances](02-animal-profile.md) and [Meaning of map points and areas](03-map-records.md).

How are photos added, stored, and unlinked in the MVP, given that files live on the server and observations contain filename lists in `photos`? Define count, size, and format limits, failed-upload handling, filename uniqueness, resolution after import on another device, and missing-file behavior. Does removing a photo from a case only unlink it or also delete the server file, and what happens to older JSON exports? Refine photo links for the profile, hiding places, and areas, including the main profile photo and captions. Account for future access control without adding authentication to the MVP. This resolution concerns product behavior; isolate technical facts that require research.

## Answer

The user accepted the rules for adding photos, quality, unlinking, and error handling. They rejected the proposed limits: the MVP has no limit on photo count or individual file size.

- Add multiple photos at once and allow taking a photo on a phone while adding an entry.
- Files receive unique server filenames without overwriting other photos with the same original name. Store these names in the relevant entry's `photos`; images are not embedded in JSON.
- Proposed target formats: JPEG, PNG, WebP, and HEIC. HEIC support needs technical verification and has not yet been confirmed for the selected technology.
- No product-level count or size limits in the MVP. Do not carry the earlier 20/10-photo or 20 MB proposal into the specification or implementation. Actual infrastructure limitations need investigation when choosing the solution.
- Preserve the original file and create a thumbnail for fast display. Full quality remains available for inspecting details.
- Removing a photo from the profile or an entry unlinks it from the case but does not delete the server file. Older JSON exports can still use the file. Automatic asset cleanup is not part of the MVP.
- A failed upload does not prevent retaining the entry text. Show an error and a retry option; only files successfully saved on the server enter `photos`.
- A missing photo does not block case import or opening. Show its filename and “Photo unavailable”; retain the reference in the data and subsequent exports.
- Relationships: profile photos with main-photo selection and captions, and photos attached to point-history entries and area checks. The server resolves assets by filename even after import on a second device, without full URLs in `photos`.
- Restricting photo access to the signed-in user remains a later stage. Cleaning up unused files also remains outside the MVP.
- For compound/multi-image or animated files, one still preview of the primary image is sufficient in the MVP. Preserve the unmodified received original for download. Do not add frame browsing or animation playback as required MVP features. Keep both a thumbnail and a full-resolution compatible preview where required by the existing HEIC decision.

[Technical feasibility of maps and photo storage](09-technical-feasibility.md) investigates formats, thumbnails, persistence, and service constraints. [JSON contract for case transfer and later analysis](06-json-contract.md) refines original and thumbnail filenames and profile metadata while retaining `photos` as a filename list. [Interface layout and map workflow](05-map-workflow.md) covers upload progress, errors, retry, and unlinking.
