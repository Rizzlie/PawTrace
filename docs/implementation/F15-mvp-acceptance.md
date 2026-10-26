# F15 — Complete MVP acceptance and runbook

Status: planned
Depends on: F14

## Goal

Demonstrate that the integrated desktop MVP fulfills the accepted end-to-end behavior and leave reproducible local startup, configuration, backup, and recovery instructions.

## Read first

- [Frontend architecture](../architecture/frontend.md), including library boundaries, editor ownership, and JSON/persistence flows.
- [Execution guide](README.md), including the complete task index and earlier completion notes.
- [Authoritative MVP acceptance criteria](../mvp/issues/11-mvp-readiness.md), including additional refinement cases.
- [Current architecture](../mvp/issues/10-local-architecture.md), [provider configuration](../mvp/issues/12-satellite-provider.md), and [photo behavior](../mvp/issues/07-photo-assets.md).

## Scope

1. Check completion evidence for F01–F14 against the actual code. Fix integration defects required for the existing acceptance scope; record genuinely new product decisions rather than inventing requirements.
2. Run the complete browser scenario: Docker startup, new case, optional profile, address/map point positioning, multiple history types and identifications, both basemaps, planned and actual search geometry, photos, filters, reload, and complete JSON transfer.
3. Exercise failure recovery: invalid import, failed automatic save, unavailable providers, missing images, failed derivative generation, and container recreation with retained assets. Confirm the last successful persisted case and current exportable state are handled correctly.
4. Add/complete a meaningful integrated regression suite using controlled external responses, plus minimal real provider checks. Use legitimate image fixtures and the built native-processing runtime for the actual HEIC checks.
5. Update the root runbook with the real install/build/start/stop/check commands, local configuration and private token setup, persistent directories, JSON-plus-assets backup/restore, and known tested limitations. Separate normal restart from destructive data removal.
6. Record final evidence and remaining limitations. Complete existing requirements rather than introducing a database, authentication, AI analysis, phone delivery, or publishing.

## Acceptance criteria

- Every item in the authoritative acceptance ticket has concrete pass evidence or a clearly reported unresolved blocker; a blocked requirement prevents an unqualified MVP-complete claim.
- A fresh documented setup starts successfully, preserves assets across normal container recreation, and restores a backed-up case plus assets.
- JSON transfer retains identities, uncertain times, geometry, all identification outcomes, and original filenames under active filters.
- Distinct different-animal sightings remain visible, counts match filters, and storage/derivative failures preserve the agreed data.
- Both configured real basemaps and submitted address search have been checked without load-testing public services.
- The runbook reflects actual commands and verified behavior. All task statuses and completion notes match the resulting code.

## Validation

Run relevant workspace build/static/unit/integration/browser checks and inspect the real desktop UI. Capture concise evidence for the end-to-end flow and representative failure paths. Confirm no new commits were created while the user's prohibition remains in effect. Report exact unverified checks rather than turning them into silent future work.

## Architecture integration

Exercise the architecture verification matrix across real browser persistence, editor sessions, Leaflet events, failed replacement, and export. Confirm the Nx dependency boundaries and all selected-package caveats have actual implementation evidence.

## Completion notes

To be filled during implementation.
