# F06 — Animal profile and escape circumstances

Status: planned
Depends on: F04, F05

## Goal

Provide the optional animal profile and escape-incident forms without making data entry a prerequisite for working on the map.

## Read first

- [Frontend architecture](../architecture/frontend.md), including library boundaries, editor ownership, and JSON/persistence flows.
- [Execution guide](README.md), [F04](F04-domain-and-json-contract.md), and [F05](F05-case-persistence.md).
- [Animal profile and escape circumstances](../mvp/issues/02-animal-profile.md).
- [JSON relationships and unknown values](../mvp/issues/06-json-contract.md).
- [Approved visual reference](../mvp/prototypes/pawtrace-floating-prototype.html).

## Scope

1. Add an accessible profile form grouped into basics, identifying features, health, behavior, habits/area familiarity, and free text. Cover the agreed profile fields while keeping every field optional and supporting arbitrary species.
2. Preserve unknown versus explicit negative values. Support approximate age and appropriate units without inventing a birth date or answers to unanswered questions.
3. Add separate escape circumstances: precise or uncertain time, situation, possible direction, and familiarity with the location.
4. Represent the location only through the canonical point reference. Existing imported points can be referenced; interactive map selection and assignment are completed in F07. Never create a second editable coordinate copy in the profile.
5. Connect edits to F05 saving/export and maintain the map context when opening or closing the form. Profile photos, captions, and main-photo selection arrive in F13.
6. Use Signal Forms against the single state's editor draft with explicit Save/Cancel. Confirmation validates and commits one document change; editing a field must not mutate committed profile data by reference.

## Acceptance criteria

- A new case works with an empty profile, and filling fields does not require completing unrelated groups.
- The agreed basics, recognition, health, behavior, habits, and free-text information can be entered and restored.
- Unknown values, explicit negative answers, approximate age, and uncertain escape time survive saving and JSON transfer distinctly.
- The incident references at most one existing point or an unknown location; it stores no independent map position.
- The form fits the desktop workspace, has labeled controls and visible focus, and preserves unsaved-state feedback from F05.

## Validation

Exercise an indoor-cat profile, another species, and a largely unknown profile. Reload and export/import each representative case. Verify the form does not turn empty answers into negative values or precise times. Check the incident reference against an imported point.

## Architecture integration

Use Signal Forms against the initialized editor payload through the accepted private writable projection into the single root. Explicit Save validates and commits once; Cancel discards the isolated draft. Verify nested edits, unrelated root changes, and stale-session writes.

## Completion notes

To be filled during implementation.
