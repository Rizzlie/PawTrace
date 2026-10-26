# Case lifecycle and safe file saving

Parent: ../map.md
Label: wayfinder:grilling
Type: grilling
Status: resolved
Assignee: macsy
Blocked by: none

## Question

What is the lifecycle of a single case: creation, JSON saving, closing, reopening, and starting another case? Decide whether the file is downloaded on demand or an additional automatic browser copy is needed; how unsaved changes are indicated and protected when importing or starting another case. What happens after refreshing the page or opening the file on a phone? The resolution should define user expectations without prescribing the technical mechanism yet.

## Answer

The user confirmed the following decisions on 2026-10-26.

- The application automatically preserves the current case in the browser and restores it after a refresh or return visit. This is a local MVP mechanism without a user account.
- The “Export JSON” button downloads the complete case as it exists at export time. The file is used for keeping a copy and manually transferring data between devices.
- Continuing on another device means transferring the file yourself and opening it in PawTrace. The MVP has no automatic synchronization.
- Importing another file or starting a new case replaces the current case only after a warning and an offer to export the existing data. The user can cancel the operation.
- Files are not merged. If a case is edited independently on two devices, the user chooses which file to continue from.
- The database, authentication, and their associated saving mechanisms belong to a later stage.
- If automatic browser saving fails, retain the latest changes in memory, show a persistent unsaved-changes indicator, and offer immediate JSON export. Show a successful-save status only after storage succeeds. Retain the last successfully stored version on failure.
- The MVP does not require a single-editor browser-tab lock or cross-tab edit protection. Revisit concurrent editing after database-backed persistence; a specific synchronization or WebSocket design has not been selected.
- Finding and securing the animal is recorded as a check result, without a separate case-closing workflow in the MVP. The case remains editable for additional recovery details, corrections, and complete-history export.

Message details and save-status presentation belong to [Interface layout and map workflow](05-map-workflow.md). Invalid imports and format versions belong to [JSON contract for case transfer and later analysis](06-json-contract.md).
