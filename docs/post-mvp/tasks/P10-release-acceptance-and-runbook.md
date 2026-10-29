# P10 — Release acceptance and Compose recovery runbook

Status: planned; implementation not started.
Blocked by: P05 — Version conflicts and deleted-case recovery; P08 — Complete ZIP import and replacement; P09 — Light visual polish. These include P01–P04 and P06–P07 transitively.

## Assumptions and sources

- Read the full [specification](../spec.md), [task index](README.md), all prerequisite delivery/review records, [relational ADR](../../adr/0005-store-cases-relationally-in-postgresql-and-postgis.md), and the existing [runbook](../../../README.md).
- Product scope is one shared Docker Compose instance. Hosting purchase, domain selection and public deployment remain deferred; a local production-like stack and live-Google localhost callback are sufficient to validate this release before a later deployment project.
- P01–P09 deliver behavior slices. This task integrates and verifies them; it is not permission to mark incomplete prerequisites done or silently rebuild unfinished features.

## Scope

Deliver a complete acceptance scenario through Google login, two private cases, existing domain editing, online/offline saves, conflicts, authorized photos and ZIP/JSON transfer. Exercise the production-built application with PostgreSQL/PostGIS and persistent originals in Compose, not just a mocked frontend server.

Document required configuration, Google callback/identity scopes/optional allowlist, session activity/expiry, migrations/readiness, normal start/stop/recreate, failure recovery and a consistent full-instance backup/restore procedure for database plus original directory. Explain how JSON-only transfer differs from full ZIP and full-instance backups. Update current product documentation without rewriting historical MVP decision records as if they had always included shared persistence.

Verify cross-task boundaries: import versus offline pending work; session expiry versus reconnect; logout versus delayed callbacks; filename isolation across imports; case deletion versus unsynchronized edits; new screens using the existing visual language. Fix small integration defects here and report larger unmet prerequisite scope explicitly.

## Acceptance criteria

- [ ] All prerequisite criteria and verification records are complete; any unavailable required live check is a visible blocker rather than a pass.
- [ ] From a clean persistent database, Compose starts, enables PostGIS, migrates safely and serves the built application. Repeated startup and container recreation preserve users, sessions, cases and originals.
- [ ] A real-Google smoke check demonstrates login, configured admission and logout; deterministic provider tests cover negative/expiry cases separately. Secrets never enter committed docs or examples.
- [ ] Two accounts and multiple browser contexts prove private case/photo isolation across catalogue, direct API, asset paths, export and import.
- [ ] A full representative case survives relational save/reopen, offline edit/reconnect, version choice, JSON overwrite and ZIP round trip with correct original bytes and domain semantics.
- [ ] Pending local work survives expiry and failed saves, is not submitted by another account, and is cleared safely on explicit confirmed logout. Remote deletion offers export/new-case recovery without resurrection.
- [ ] A consistent backup of database plus original directory restores onto a clean Compose instance with ownership, case data and original/derivative recovery intact. Backup steps avoid mismatched database/file snapshots.
- [ ] Existing core MVP map/profile/history/area/photo/filter workflows and relevant visual viewports pass without a layout redesign.
- [ ] The runbook explains public-hosting deferral, production HTTPS/session configuration, recovery limitations and exact verification evidence. No incomplete shared app is publicly deployed by this task.

## Verification steps

1. Inspect prerequisite code/records, discover current Nx targets and run the appropriate affected typecheck/lint/test/build/e2e checks. For final combined acceptance, cover every changed project and dependent workflow; record commands, database/runtime setup and results.
2. Build/start Compose from clean test volumes and run browser acceptance against that built API/frontend with real PostgreSQL/PostGIS and original storage. Keep production images free of test login bypasses.
3. Perform a recorded two-account scenario: create two cases, edit all major record types, upload a representative original/HEIC, reopen in another context, disconnect/edit/reconnect, resolve a conflict and recover a remotely deleted case.
4. Import existing-style JSON, export ZIP, replace the open case from ZIP and import as new with no case open. Compare expected data/root-remapping and original hashes; exercise a malformed archive and lost import response.
5. Advance deterministic session time and exercise account/logout races. Separately run real-Google smoke checks using private configuration; record any external blockers explicitly.
6. Take the documented consistent full backup, restore to a fresh test instance, and verify ownership, queries, geometry and original bytes. Recreate application/database containers with retained volumes and repeat key reads.
7. Review before/after visual evidence and rerun affected keyboard/scroll interactions. Record standards and spec review findings, fixes and remaining risks before marking the release task done.

## Discussion topics and decision record

- Settled: Compose, relational/PostGIS data, persistent local files, optional admission and seven-day API inactivity; hosting and AI integration deferred.
- Record the final configuration contract, migration/recovery order, consistency strategy for database/files backup and required external checks. Clarify database-unavailable readiness rather than treating a shallow health response as proof the full application works.
- Record defects found at integration boundaries and whether they were fixed here or sent back to a prerequisite. Any scope change remains visible and requires a new decision, not a rewritten passing checklist.

## Scope boundaries

No hosting purchase, production DNS/TLS provisioning, public rollout, scheduled backups service, storage billing/quota system, or multi-instance deployment. Backup/restore is validated locally with a production-like stack. Do not use this task as a catch-all implementation of missing P01–P09 features.

## Delivery and review record

- Implementation/integration: not started; record implementer/date, prerequisite versions, branch/commit/PR and runbook changes.
- Verification: pending; attach exact Nx/Compose results, live-Google evidence, cross-account acceptance, archive hashes and clean-instance restore evidence.
- Standards review: pending; record reviewer, findings and resolutions across the integrated diff.
- Specification review: pending; map the final end-to-end evidence to all release stories and criteria, including known limitations.
- Remaining blockers/limitations and release recommendation: not yet assessed; do not describe this release as accepted until evidence and required checks are complete.
