# F14 — Filters, point summaries, and interface refinement

Status: done
Depends on: F13

## Goal

Complete the desktop workspace with context-preserving filters, accurate per-outcome point counts, and the accepted polished green floating-panel layout across the integrated features.

## Read first

- [Frontend architecture](../architecture/frontend.md), including library boundaries, editor ownership, and JSON/persistence flows.
- [Execution guide](README.md), [F08](F08-point-history.md), and [F13](F13-photo-interface.md).
- [Current interface rules](../mvp/issues/05-map-workflow.md), [refinement outcome](../mvp/issues/13-plan-refinement.md), and [visual reference](../mvp/prototypes/pawtrace-floating-prototype.html).
- [Identification glossary](../../GLOSSARY.md) and [readiness cases](../mvp/issues/11-mvp-readiness.md).

## Scope

1. Implement filters for predefined point roles, entry types, event time, and manual rejection, with the agreed unknown-time option. Keep filter state separate from exported case facts.
2. Apply filters consistently to the map/list and observation-count derivation. Overlapping time ranges and uncertain dates follow the F04 time representation; communicate precision without invented event timestamps.
3. Keep the selected point's full contextual history when opened and highlight matching entries. Manually rejected reports retain their show/hide control; different-animal identification remains independently visible.
4. Show confirmed/uncertain/different-animal counts and distinguish identification outcomes through readable labels and visual cues. A place with mixed outcomes does not receive one editable point-level identification.
5. Refine floating collapsible panels, form placement, overlapping-object selection, empty/no-result states, keyboard focus, control labels, and destructive-action confirmations. Keep the map canvas available behind panels.
6. Ensure filter/reset workflows do not modify persisted records, omit data from export, or imply that old evidence belongs to a recent time window.

## Acceptance criteria

- A point with old confirmed and recent uncertain/different-animal sightings has correct counts for each selected period.
- Different-animal sightings remain available on the map and in summaries rather than being silently hidden as rejected.
- Selecting a matching point retains earlier contextual actions in its full history, with matches highlighted.
- Unknown-time entries, points without history, no-result views, and overlapping points have usable behavior.
- Profiles, histories, areas, and photos share the accepted visual direction without static sidebars shrinking the map.
- Export is complete under every tested filter combination.

## Validation

Use a multi-point fixture with mixed assessments, rejected records, uncertain/range/unknown times, empty histories, and photos. Check filter combinations, resetting, derived counts, full-history context, and export equality. Inspect the integrated desktop workspace and keyboard interactions; retain a usable narrow layout without adding phone acceptance or HTTPS work.

## Architecture integration

Derive filters, counts, and scene projections from the single state; keep UI-only fields out of storage/export. Unrelated UI updates must not reset active drafts or reconstruct all Leaflet layers.

## Completion notes

Implemented filters for place roles (the four predefined roles plus the derived escape location from `case.escape.escapePointId`), entry types and event period, with an explicit "Include entries with unknown time" option and a separate show/hide control for manually rejected reports. The framework-free `filters/case-filter.ts` owns the policy. `withCaseFilters` stores the criteria in `CaseState.filter` through named events. Case replacement resets them through `createCaseState`. They never reach the document, the revision counter, autosave or export.

Time semantics (user-confirmed): periods are inclusive local days in the case time zone. Exact and approximate instants use their local day, date-only entries their date, and ranges match when their possible days overlap the period, with open ends unbounded. Unknown times match only with the explicit option, which is off by default and disabled until a period is set. No event timestamp is invented; the filter explains the overlap rule.

`mapPlaces` keeps stable point numbers and lists only visible places. Each place's confirmed/uncertain/different-animal counts come only from its matching entries, so an older confirmed sighting does not count toward a recent period. Entry-type and period criteria require matching history. Without them, places without history stay visible. Hiding rejected reports never hides a place or its other matching entries. Different-animal sightings keep their own colour, label and dashed accent and are unrelated to rejection. Rejected reports are hidden by default (decision 05), so default counts now exclude them. Two earlier store expectations and one browser expectation were updated accordingly, and the previous totals are still asserted with rejected reports shown.

The selected place keeps its complete chronological history. Matching entries are highlighted ("Pasuje do filtrów") and the counts carry a filtered-view note. Hidden rejected reports are summarised with their own show/hide button, which does not mark the filter as active. A filtered-out selected place keeps its open details. The places panel gains a Filters toggle (it also expands a collapsed list), a visible-count status, a no-result state with reset, empty-list texts, per-place counts (also in the accessible description, not the name) and an inverted-period warning. The filter section scrolls inside the floating panel so the list and heading stay visible at 1280 px and 390 px. Floating collapsible panels, the overlapping-point chooser, keyboard focus restoration and destructive-action confirmations were already in place from F07–F13 and are unchanged. F14 did not restyle the profile, area or photo panels.

TDD ran at the user-confirmed CaseStore seam. The first test (period counts and hidden rejected reports) failed before implementation. Later visibility and range tests passed on first run because the initial slice was broader than that test required, so key branches were mutation-checked instead (removing the escape role or the entry-criterion rule makes them fail). Store regressions cover per-period counts, role and type narrowing, different-animal visibility, no-result views, reset, full history with highlighted matches, export equality under four filter combinations, no revision or storage write, multi-day and open-ended ranges across the Warsaw day boundary, and the separate rejected toggle.

### Review

Standards review found no documented-standard violations. Judgement calls acted on: one shared `reportShown` predicate, null range bounds instead of a `'￿'` sentinel, a structural `filterActive`, an `EntryType` alias and removal of a redundant count projection. The identification badges and empty-state texts are F14 scope items (outcome cues, empty states), not unrelated changes.

Spec review found two defects, both fixed with regressions. First, the filters were unreachable while the list was collapsed, as it is by default on phones. Second, the history's rejected-report toggle marked the whole view as filtered and highlighted every entry. The reviewer also noted that an open-ended range (for example "from 1 October") overlaps every later period. This follows the user-confirmed overlap rule and is explained in the filter text.

### Validation — 2026-10-29

- `npm exec nx run-many -- -t typecheck lint test build -p workspace map-engine browser-persistence shared-ui case-domain web web-e2e --output-style=static` passed for all 7 projects (workspace 67 tests, case-domain 123, map-engine 34). No API code changed.
- Browser suite: all **80** Chromium scenarios passed with two workers and zero retries (`npx playwright test --workers=2 --retries=0`), using an isolated Playwright configuration on ports 3101/4301 because the user's application occupied port 4200. The new `filters.spec.ts` covers 1280 px and 390 px: period and role/type filters, map markers and counts, full highlighted history, rejected toggle, unknown-time option, no-result state, keyboard reset, export equality and persistence after reload. The desktop screenshot was inspected.
