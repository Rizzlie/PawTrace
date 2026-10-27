# F06 — Animal profile and escape circumstances

Status: done
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

Use Signal Forms against the initialized editor payload through a private writable projection into the isolated CaseStore editor session (ADR 0004). Explicit Save validates and commits once; Cancel discards the isolated draft. Verify nested edits, unrelated root changes, and stale-session writes.

## Completion notes

Implemented on `feat/f06-animal-profile` on 2026-10-27, with all changes left uncommitted for the user's manual review.

The floating profile panel keeps the map mounted and available. Native disclosure groups cover every agreed optional field, arbitrary species, approximate age in months/years, kilograms (including decimal comma input), and explicit unknown/yes/no answers. Escape circumstances have unknown, exact, approximate, date-only and bounded/open-ended range times with the original description. Known moments use native `datetime-local` controls in the case time zone, while date-only events use `date`. Conversion produces unambiguous ISO timestamps for JSON. A skipped DST hour is rejected; a repeated hour requires selecting its occurrence. Unchanged imported instants retain their original offset and precision, even when the device zone differs. An unknown hour is never inferred. The location selector references an existing imported point or unknown, with no coordinate copy. Existing photos, captions and main-photo references survive profile edits; photo controls remain in F13.

`CaseStore` owns one plain state, with focused NgRx Events features for the initialized editor, committed document, file transfer and persistence (ADR 0004). A private custom-set `linkedSignal` supplies the genuine Signal Forms model and immutably updates only that draft. Form effects are initialized once outside reactive computations and released with their editor session. Session checks ignore old field writes. Save performs explicit input conversion and whole-document validation, updates factual modification time, commits one revision and requests F05 saving. Cancel discards the draft. Dirty close/import/new-case transitions offer Save / Discard / Stay; failed validation keeps the editor active. Export warns that drafts are excluded. Map and persistence updates retain in-progress fields.

Validation:

- State tests exercise public commands and the actual Signal Forms tree: nested writes, isolation across map changes, one-revision/no-op Save, Cancel, stale sessions, validation, persistence recovery, cancellable route exits, and replacement/navigation interleaving. The original 24 state regressions passed and now exercise the three public owners in `case-workspace.spec.ts`.
- With command-scoped `BASE_URL=http://127.0.0.1:4200`, `npm exec nx run-many -- -t typecheck lint test build e2e --output-style=static` passed all 25 tasks across eight projects, including both application builds and 39 Chromium scenarios. The existing API was reused and a web development server was started.
- After the final replacement/navigation guard correction, `npm exec nx run-many -- -t typecheck lint test build e2e -p workspace web web-e2e --output-style=static` passed all 11 selected/dependency tasks, including all 40 Chromium scenarios (with the same command-scoped `BASE_URL`).
- Fourteen F06 browser scenarios cover the full optional profile, other/unknown species, reload and JSON transfer, canonical point/photos, every time variant, native input types, DST gaps/overlaps, a device zone different from the case, Back/Forward/Stay, clean replacement cancellation, and dirty replacement interrupted by Back. A state regression failed before the final interleaving correction and passed afterwards.
- Initial collaborative-browser inspection checked desktop layout, labels, focus and nonoverlapping field scrolling. Native controls and final route behavior were verified by Chromium acceptance tests.
- Formatting checks and `git diff --check` passed. Stable typed group IDs keep labels and ordering independent of field rendering.

The routing refinement splits the application shell, lazy workspace/map route and lazy `/profile` child route. The map remains mounted when the profile opens/closes. The initial production bundle decreased from 569.44 kB to 296.33 kB (below the existing 500 kB warning threshold); the workspace/map code still downloads when that route is visited. The profile view downloads on demand. This is code splitting, not a claim that the total code needed to visit every view decreased. Existing map E2E non-null-assertion warnings remain; F06 adds no lint warnings. F02 live Mapbox acceptance remains separately blocked.

### Routing and native date/time refinement

The user's follow-up requested real routing/lazy loading and native date/time entry. `App` now hosts the header and router outlet; a lazy `WorkspacePage` keeps the map and case controls mounted, with `/profile` as a lazy child. The activation guard checks case availability, and the view creates its editor only when instantiated. A cancellable deactivation decision reuses Save / Discard / Stay, including browser Back/Forward. Cancelled replacement returns to the root route when no editor remains. Cancelling or failing a lazy component load cannot leave an editor created by the guard.

`incident-time.ts` converts between native wall times and real instants using the case's IANA zone. It derives possible instants without relying on the device time zone, rejects skipped times, exposes both repeated-hour choices, and preserves original imported timestamps when unchanged. Schema/import/export formats remain unchanged. UI choices and control bindings are computed from the draft.

### Standards review

Independent read-only review against task-start commit `72128bd91ef8bac50729933a8a823f322bfb84fb`, including untracked files: no documented-standard violations. One maintainability suggestion identified display labels/order controlling field groups; replaced with stable typed IDs. A second independent review confirmed the concern resolved, with no remaining actionable findings.

### Spec review

Independent read-only reviews against the same fixed point covered the original F06 scope and the routing/native-time refinement. Follow-up findings about cancelled replacement URLs, lazy activation creating stale editors, and replacement/navigation interleaving were corrected and covered by regressions. The final review confirmed all findings resolved, with no remaining concrete correctness defects.

### State ownership refinement (superseded by ADR 0004)

The AppState facade was removed in favor of CaseState, AnimalEditor and CaseFiles; see ADR 0003 and the workspace README. CaseState owns the single committed snapshot and persistence transaction, AnimalEditor owns its isolated form session and cancellable close decision, and CaseFiles coordinates file transfer and replacement. The screen still binds map inputs/outputs directly, with no MapState and no case business rules in map-engine. No NgRx dependency was added; SignalStore Events remains a discussed alternative.

After this refactor, the 24 original state regressions plus two delayed-Save cancellation regressions passed through the public service commands and actual Signal Forms tree. The selected Nx typecheck/lint/test/build/e2e run passed all 11 tasks, including 26 state tests and all 40 Chromium scenarios. Existing map E2E lint warnings remain unchanged. No commits, pushes or PR operations were performed.

### NgRx SignalStore with Events

At the user's request, replaced the three state-owning services with one workspace-scoped CaseStore using @ngrx/signals 22.0.1. The composition is in `case-store/case-store.ts`: withState, withCaseProjections, withCaseView, withAnimalEditing, withCaseFiles and withCasePersistence. ADR 0004 records this choice. Typed named events and reducers own every state update; computed values derive UI projections; async handlers perform parsing/storage. Atomic profile confirmation updates the document, closes the draft and increments its revision together. Promise-returning commands support forms and cancellable route guards. Form injectors, AbortControllers and pending decisions remain private resources, with no second draft copy.

The store and Events dispatcher share the lazy workspace route's injector. Sibling workspace scopes are isolated; NgRx intentionally propagates ancestor events to descendants, so workspace store scopes are not nested. Persisted map-view changes stay in the same store, while map-engine remains the Angular/Leaflet adapter with no store injection or business rules. SnapshotWriter retains its original coalescing, retry and durable replacement guarantees.

Validation: the selected Nx typecheck/lint/test/build/e2e run passed all 11 tasks, including 29 state tests, the shell test and all 40 Chromium scenarios. Three additional state regressions cover sibling dispatcher isolation, superseded import results, and a stale form write during a new session's Save. The stale-write regression failed before its session check was added, then passed. Lazy profile/domain chunks remain separate; the initial production bundle is 295.54 kB. Existing map E2E lint warnings remain unchanged. All work remains uncommitted for manual review.

### Header help refinement

Moved the persistent on-map guide into a header help button using Angular Material MatIcon with a bundled Google Material help_outline SVG (Apache-2.0 license included in public assets; no external icon font request). A native modal dialog uses a translucent blurred backdrop, responsive content and native Escape/light-dismiss behavior. Closing returns focus to the header help button. Successful first display records the versioned localStorage preference through browser-persistence; later visits can open help manually. Blocked browser storage does not prevent using help, but cannot retain the preference.

The selected Nx typecheck/lint/test/build/e2e run passed all 11 tasks, including 43 Chromium scenarios. New help scenarios cover 390px/1280px layouts, first display, persistence after refresh, manual reopening, keyboard/backdrop closing, focus restoration and blocked localStorage. Existing feature scenarios use a returning-visitor fixture; the standalone help suite exercises a fresh browser context. Existing map E2E warnings remain unchanged. No commits were made.

### Case controls in the header

The lazy WorkspacePage now composes AppHeader, CaseControls, the new-case button and the map under the same route-scoped CaseStore/dispatcher. AppHeader accepts projected controls without importing workspace state. Next to the logo, controls show the committed animal name (falling back to the case title), Edit Profile and a CDK Menu for JSON import/export; New Case is placed immediately before Help, including at mobile widths. The old floating case panel was removed. Save/recovery/error feedback and dirty-draft/replacement dialogs remain available.

The selected Nx typecheck/lint/test/build/e2e run passed all 11 tasks, including 29 state tests and 45 Chromium scenarios. New 390px/1280px header scenarios verify the saved animal name, keyboard navigation and focus return for the JSON menu, button order and import through the real file chooser. Existing export/import, persistence, Save/Cancel, navigation and help scenarios also passed. All changes remain uncommitted.
