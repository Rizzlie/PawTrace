# F15 — Complete MVP acceptance and runbook

Status: done
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

The user authorized commits, branches and a PR for this task on 2026-10-29, which supersedes the earlier no-commit instruction in this file's validation section and the execution guide.

### F01–F14 evidence check

Each task's completion notes were compared with the code and its tests. F09 still carried `in_progress` although both independent reviews and the review fix were already verified and merged in #12; its status is now `done`. The other statuses matched. No product decision was reopened.

### Integration defect found and fixed

The new acceptance flow found one cross-feature defect (F07 × F09). While a point was being positioned, a click inside a saved search area selected the area instead of placing the point, so a sighting inside a planned area could not be positioned by clicking. A click on a saved shape now positions an active area or measurement draft first, then an active point draft (the map's `placePoint` path), and selects the area only when nothing is being placed. A map-engine regression (`places a point draft inside a saved area instead of selecting the area`) failed before the fix, and the degraded-provider browser scenario failed on it as well.

### Acceptance evidence

`apps/web-e2e/src/mvp-acceptance.spec.ts` drives the UI against the real API, with controlled tiles, map configuration and geocoder responses:

1. **Complete flow from an empty case:** new case; profile with only a name; escape location from a submitted address; a second place by map click (saving without a name is refused); confirmed, uncertain and different-animal observations; a rejected report with a reason; a food-placement action; a note deleted after confirmation; a real photo upload. Then: switching to satellite and back with attribution; a circle plan with a whole and a partial (custom 40 m) check; a polygon plan. A period filter changes marker and panel counts (`Szukane: 0 · Niepewne: 1 · Inne: 1`), keeps the full history with highlighted matches and hidden rejected reports, and leaves the export identical. The exported file is checked for IDs, roles, escape reference, identifications and statuses, uncertain dates, geometry, photo filename and original name, and original bytes from the API. The case is then reloaded, replaced with an empty one and re-imported from the filtered-view export; all three exports are equal, and the photo resolves again.
2. **Every provider unavailable:** map configuration, OSM tiles, address search and all photos fail. The restored case stays intact and exportable, the failure messages show, a point is still positioned manually on the map, unavailable photos stay referenced, and the change survives a reload.

Earlier feature suites already cover the remaining failure cases: invalid JSON, unsupported version and broken references (`case-persistence`); failed and retried automatic saves, with the previous snapshot preserved on failed replacement; invalid startup storage; satellite HTTP 401/403/429/503 and timeouts; OSM retry; denied location; failed and retried uploads and derivatives; and late uploads after case replacement.

Production-container and real-provider checks (2026-10-29, Windows 11, Docker Desktop 27.4.0), on an isolated Compose project (`pawtrace-f15`, port 8180, its own asset directory) so the regular installation and `data/assets` were untouched:

- `docker compose up --build --wait` reached `healthy`, and `/api/health` returned `{"status":"ok"}`. Both acceptance scenarios also passed against the container (`BASE_URL=http://127.0.0.1:8180`), using the production build and native image processing.
- Operations drill: real `basic-8bit-srgb.heic` (1600×1200), `multi-image-burst.heic` (one still 1280×960 primary preview) and a JPEG were uploaded. SHA-256 of the originals, `originalName`, thumbnails and previews were checked after upload, after `up --force-recreate`, and after a backup made with the app stopped, `down`, and a restore into a new directory.
- Case-plus-assets restore through the UI: a case with a HEIC profile photo was exported, the assets were backed up, the stack was removed and restored into another new directory, and a fresh browser profile imported the JSON. The full-resolution preview (1600 px) displayed from the restored assets.
- `npm exec -- nx run api:verify-images` passed in the production image: every HEIC fixture with original SHA-256 unchanged, orientations, corrupt decode, derivative-write failure, native worker SIGKILL, container replacement with pending work, processing timeout and an actual 192 MiB cgroup OOM, all with originals retained and retry working. `npm exec -- nx run api:verify-assets` passed: original hash round-trips, container replacement, read-only mount and real disk-full failures with recovery.
- Minimal real providers, one manual pass: real OSM tiles; one submitted Nominatim search (`Marszałkowska 1, Warszawa` returned a Warsaw result and moved the map); Mapbox `satellite-streets-v12` tiles with the Mapbox logo and attribution using the user's public token. No load testing.

### Runbook

The root README now has a **Runbook** section: install and start, configuration and the private public-token setup, everyday non-destructive commands, data locations, backup, restore, destructive removal (kept separate) and known tested limitations. Stale statements (F01 without uploads, unverified Mapbox, outdated project status) were corrected.

### Validation

- `npm exec nx run-many -- -t typecheck lint test build` passed for all 8 projects (288 unit/integration tests: case-domain 123, workspace 67, API 60, map-engine 35, browser-persistence 2, web 1). Lint includes Nx module-boundary enforcement. The only lint output is an earlier warning in `filters.spec.ts` (`no-conditional-in-test`).
- After the review changes: map-engine and web-e2e typecheck, lint and test passed (map-engine 35 tests).
- Full browser suite: `npm exec nx run web-e2e:e2e -- --workers=2 --retries=0`. All **82** Chromium scenarios passed in 2.5 minutes, including the two new acceptance scenarios. There were no retries and no timeouts or assertions were relaxed.
- After a rebuild with the final code, `BASE_URL=http://127.0.0.1:8180 npm run e2e -- mvp-acceptance --skip-nx-cache --output-style=static` passed 2/2 against the production container. Without `--output-style=static`, Nx's terminal UI hides Playwright's summary, and a repeated run can be replayed from the Nx cache.

### Review

The standards review found no documented-standard violations. Judgement calls acted on:

- The new area intent was a command named like an event (`placed`), and it routed a shape click from the areas adapter to the map and straight back. It is now `placePoint`, which only positions a point draft. `LeafletAreas` checks its own area or measurement draft first.
- The e2e flow reuses one `addEntry` helper.
- A misnamed locator was renamed to `observation`.

Accepted as is: the long single acceptance flow (splitting it would lose the cross-feature intent) and the per-file e2e helpers (established local idiom).

The spec review found no missing requirement. It confirmed that the cited earlier failure-path coverage exists. Acted on: the F15 index status, re-running the full browser suite before `done`, the runbook's menu wording (the visible **JSON** menu, accessible name "Plik JSON"), and a note that Compose publishes Redis on loopback `REDIS_PORT`. It also flagged the rewritten commit policy in the execution guide as possible scope creep. That policy is kept, because it implements the user's authorization and matches CLAUDE.md and CONTRIBUTING.md.

### Remaining limitations

See the README's known tested limitations. Not exercised: a Linux host (bind-mount ownership for UID 1000), phone hardware and LAN/HTTPS access (outside this stage by decision 11), and real-browser HTTP cache hit rates.
