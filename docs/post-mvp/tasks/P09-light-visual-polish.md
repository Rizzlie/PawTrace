# P09 — Light visual polish

Status: planned; implementation not started.
Blocked by: none.

## Assumptions and sources

- The user clarified that design means light spacing/detail refinement, not a new layout or mobile expansion. Read [the specification](../spec.md): Runtime and visual scope, and [execution rules](README.md).
- The current application already has a shared Material/theme layer, floating controls and a map-first workspace. [The accepted frontend architecture](../../architecture/frontend.md) keeps presentation and map adapters separate.
- This independent slice refines existing shared primitives/workspace only. P01–P08 use the same visual language for their screens; P10 checks the final combined result.

## Scope

Inspect the current rendered workspace and identify concrete spacing, alignment, control-density and panel-padding inconsistencies. Make a small, coherent adjustment through existing theme/shared component styles and narrowly scoped view styles. Preserve map area, actions, editing behavior and established panel placement.

Record the specific affected surfaces and before/after evidence. New layout structures, navigation patterns, branding, unrelated animations or component-library rewrites are not needed. Keep focus visibility, keyboard access, readable labels, scroll reachability and usable modal controls.

## Acceptance criteria

- [ ] A concrete list of spacing/alignment adjustments is recorded; changes are observable without introducing a different workspace layout or workflow.
- [ ] Shared controls/panels have consistent gaps/padding and alignment, using the current visual system rather than scattered conflicting overrides.
- [ ] At the existing desktop acceptance size, map controls and editor actions remain visible/reachable without clipping or unintended overlap.
- [ ] Existing narrow-screen behavior does not regress: dialogs, scrollable panels, labels and primary actions remain reachable. This is regression protection, not a new mobile feature commitment.
- [ ] Keyboard traversal, focus indication and existing accessible names remain intact; photo/map interactions and save/import confirmations retain behavior.

## Verification steps

1. Inspect the actual application using the permitted local/browser testing workflow; do not treat a new mockup as verification of the running UI. Capture before/after evidence of each affected surface at the same viewport and state.
2. Run relevant Nx UI/workspace/web lint/typecheck/build checks. Run affected existing Playwright scenarios where shared style changes can affect interaction; do not create tests that merely assert chosen spacing constants.
3. Exercise the map toolbar, profile/editor panel, point/history/area controls, photos, filters and confirmation dialogs at existing acceptance viewports. Use keyboard navigation and verify scroll reachability.
4. Record remaining existing visual issues separately instead of expanding this slice into a redesign. P10 will repeat key checks with newly added login/catalogue/transfer screens.

## Discussion topics and decision record

- Settled: spacing/detail polish only, existing map-first layout and theme retained.
- Record the observed inconsistency, chosen shared token/style adjustment and affected components. Routine spacing choices do not require another product interview.
- Propose a separate scope change only if a real usability problem cannot be fixed within the existing layout.

## Scope boundaries

No new navigation, branding, design system, animation project, mobile-specific architecture or auth/persistence changes. Newly introduced screen functionality belongs to its own behavior slice; this task remains independently verifiable before those slices land.

## Delivery and review record

- Implementation: not started; record implementer/date, affected surfaces, branch/commit/PR.
- Verification: pending; attach before/after evidence, viewports, keyboard/scroll checks and exact commands/results.
- Standards review: pending; record style ownership and shared-token findings/resolutions.
- Specification review: pending; confirm light polish boundaries and no workflow/layout expansion.
- Remaining blockers/limitations: list unverified view states or known existing issues rather than treating them as fixed.
