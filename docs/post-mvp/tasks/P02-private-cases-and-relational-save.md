# P02 — Private case catalogue and relational save

Status: implemented on `feat/p02-private-cases`, independently reviewed before the review fixes; the fixes are verified by tests but were not re-reviewed. The user resolved both open decisions on 2026-10-30.
Blocked by: none. P01 is complete: the user confirmed a successful live Google login on 2026-10-30, which closed P01's remaining external check and unblocked this task.

## Assumptions and sources

- Read [the release specification](../spec.md): Relational case persistence and spatial data; Ownership, catalogue, and API behavior; Autosave, offline work, and conflicts. Read the [task execution rules](README.md).
- [ADR 0005](../../adr/0005-store-cases-relationally-in-postgresql-and-postgis.md) selects relational PostgreSQL/PostGIS, not a whole-case JSONB row. [JSON v1](../../architecture/case-json-v1.md) and its executable complete/minimal fixtures define existing data semantics.
- The existing [frontend architecture](../../architecture/frontend.md) and [committed-document ADR](../../adr/0002-one-state-with-document-only-persistence.md) preserve committed data separately from drafts and derived UI state.
- PostGIS references: [coordinate order](https://postgis.net/docs/ST_MakePoint.html) and [SRID](https://postgis.net/docs/ST_SetSRID.html). P01 supplies authenticated identity, migrations and durable database/runtime support.
- Prerequisite status: P01 ([PR #20](https://github.com/Rizzlie/PawTrace/pull/20), merged as `3a47d8f`) counts as complete because the user confirmed a successful live Google login on 2026-10-30. That confirmation is the reason P02 is unblocked.

## Scope

Deliver My cases and the complete online path from creating a private case through editing existing profile/map/history/search workflows to reopening it on another browser. Add list/create/open/rename/confirmed-delete UI and owned case API. Persist the full committed domain through relational mappings in one transaction, including optional values, event-time variants, relationships, attachment references and map view. Add PostGIS storage without changing circle/polygon meaning or actual-search snapshots.

Wire existing committed-change events to online autosave with a truthful server acknowledgement and a storage revision separate from domain timestamps. Enforce optimistic concurrency on save, rename and delete from the first implementation; a stale mutation preserves local committed data and reports a conflict rather than retrying blindly. P05 adds the complete conflict-choice workflow. Handle lost mutation responses with idempotency/reconciliation so retrying a successful request does not duplicate cases or overwrite a newer revision.

Photo references may remain unavailable placeholders; knowing a filename does not grant ownership of an existing server image. P03 enables case-owned photo uploads and reads. Keep that delivery boundary visible without dropping existing document fields or accepting them and silently discarding them.

## Acceptance criteria

- [x] Owner A can create two named cases, open each, rename one and delete it after confirmation; owner B cannot list, read, mutate or delete either by direct API calls.
- [x] Editing and reopening preserves every existing v1 domain field and relationship, including all history/check variants, rejected observations, optional/null/false values, Unicode, photos-as-references and map view.
- [x] Relational reconstruction passes the existing strict case schema. No full-case JSON/JSONB database field substitutes for the relational model.
- [x] Positions use longitude/latitude correctly; circles retain exact center/radius, polygons preserve the v1 open ring, and actual searched geometry does not change when its plan changes.
- [x] Non-UUID textual identifiers work. Two cases can contain the same imported source IDs without collision or cross-case links. Invalid or cross-case observation/escape references cannot be committed.
- [x] Date-only, unknown and approximate event times retain precision/descriptions; offsets and list ordering survive where exposed by the contract. Storage time never invents an incident time.
- [x] A failed candidate write leaves the prior complete case intact. Stale save/rename/delete requests are rejected atomically; retries after a lost acknowledgement do not duplicate creation or bypass versions.
- [x] Only committed data saves. A response acknowledges the captured case/revision; switching cases or receiving delayed responses cannot mark unrelated state saved. Map-only saves do not alter factual case timestamps.
- [x] Creation/deletion are unavailable offline with an explanatory state. The list and save indicator distinguish loading, empty, failure and success.
- [x] Database/application/container recreation with retained volumes preserves cases and relational migrations. The UI never claims server success before commit acknowledgement.

## Verification steps

1. Run relevant Nx contract, API, workspace, typecheck/lint/build and browser checks. Use real PostgreSQL/PostGIS in the HTTP integration suite and the selected migration lifecycle.
2. Save/load complete and minimal fixtures through the owned API. Compare reconstructed validated documents, allowing only explicitly documented root/storage metadata changes. Add coverage for each event-time variant, sparse profile values and non-UUID IDs.
3. Use geographically asymmetric coordinates, a circle, a concave polygon and distinct planned/actual areas to catch swapped axes, ring closure and approximation regressions.
4. Inject a database error after part of the mapping work; assert the previous case and foreign-key relationships remain unchanged. Send concurrent versions and replay a request whose commit succeeded but response was lost.
5. In two browser contexts for one owner, create/edit/reopen; in a third context for another owner, attempt direct URLs and mutations. Demonstrate catalogue rename/delete, cancellation and server failure states.
6. Restart the database and application with retained volumes and repeat read/round-trip checks. Record the actual schema/SQL mapping and migration evidence.

## Discussion topics and decision record

- Settled: one private owner, multiple cases, relational storage/PostGIS, document-shaped transport, online create/delete and no archive/status workflow.
- Record: table/variant mapping, case-scoped ID constraints, sparse-field/time-offset preservation, circle representation, row ordering and version/idempotency contract. Use the SQL tooling selected in P01; changing it needs an explicit rationale.
- Preserve current committed-document/draft boundaries. If a proposed mapping loses any v1 information, resolve it here rather than quietly changing the file contract.

Decisions taken (implementer, 2026-10-30):

- **Test seams.** I used the three seams the user accepted in the [specification's testing decisions](../spec.md#testing-decisions); the sub-agent could not hold an interactive seam discussion. (1) Authenticated HTTP over real PostGIS 17/3.5 with the signed controlled OIDC provider: `apps/api/src/cases.spec.ts`. (2) Playwright against the real application: a new `apps/web-e2e/src/my-cases.spec.ts`, plus the existing suites migrated to server cases. The new spec runs in its own serial `ownership` project because it switches provider identities and restarts the host. (3) Store/adapter seams: `case-workspace.spec.ts` with a controlled `CaseStorage`, and `cases/case-storage.spec.ts` at the HTTP boundary. There are no repository mocks, no SQLite and no table-layout tests. One test reads PostGIS directly, only as SRID/axis schema evidence.
- **Tooling.** Drizzle 0.45.4 / drizzle-kit 0.31.11 from P01, unchanged. Drizzle's built-in `geometry` handles only points and writes WKT without an SRID. `cases/schema.ts` therefore defines `geometry(Point,4326)` and `geometry(Polygon,4326)` custom types. Writes use parameterised `ST_SetSRID(ST_MakePoint(lon, lat), 4326)` and `ST_MakePolygon`. Reads decode PostgreSQL's hex EWKB doubles exactly (`cases/geometry-codec.ts`), which avoids the decimal rounding of `ST_AsGeoJSON` and WKT. Migrations moved from `src/auth/migrations` to `src/database/migrations`. `0000_auth_session.sql` is unchanged apart from checkout line endings (`core.autocrlf=true`), which the migrator ignores because it orders by the journal timestamp, not the file hash. After the move, `api:db-generate` reports no schema changes. A global `DatabaseModule` now owns the single migrated pool that authentication and cases share.
- **Tables and variants.** Migration [`0001_owned_cases.sql`](../../../apps/api/src/database/migrations/0001_owned_cases.sql) adds 17 tables to P01's 4, for 21 in total. No JSON/JSONB column exists.
  - `owned_case`: owner, `version`, server `saved_at`, title, time zone, verbatim `created_at`/`updated_at`, and the map view with a `geometry(Point)` centre.
  - `case_record`: the case-scoped identifier namespace, with a `(case_id, id)` primary key plus `kind` ∈ case/point/entry/area/area_check.
  - `event_time`: one row per case escape, point entry and area check, with a per-kind CHECK.
  - `case_escape` and `animal_profile`.
  - `point` (+ `point_role`).
  - `history_entry`, with variant tables `observation_detail`, `action_detail` and `point_check_detail`. Notes have no variant row.
  - `search_area` (planned geometry) and `area_check` (actual geometry).
  - `photo_reference`: ordered filenames per record. The animal profile uses the case record.
  - `photo_caption` and `photo_asset`.
  - `case_mutation`: the idempotency ledger.
- **Case-scoped IDs.** Every record row is keyed by `(case_id, id)` and references `case_record(case_id, id, kind)`. v1's document-wide uniqueness therefore holds across kinds within a case, while two cases can reuse the same text IDs (tests use non-UUID IDs with Unicode, `/` and `:`). Every relationship is a composite foreign key that includes `case_id`, so none can cross cases:
  - entries → point, checks → area, escape → point;
  - main photo → profile photo, captions → profile photo;
  - point-check and area-check links → `history_entry(case_id, id, type)`, through a fixed `observation` type column.

  The strict v1 validator rejects broken references first (HTTP 400 with issue paths). The constraints are the database-level backstop.

- **Sparse fields.** `animal_profile.present_fields text[]` lists the keys present in the optional profile, so omitted, `null`, `false` and `[]` stay distinct. Typed columns hold the values: `neutered`, `microchipped` and `familiarWithArea` are nullable booleans, and age is three nullable columns that must be all null or all set. `action_detail` and `point_check_detail` use `details_fields text[]`: NULL means `details: null`, an empty array means `{}`, and otherwise it lists the present keys.
- **Time and offsets.** All contract timestamps, dates and range endpoints are stored verbatim as text, after the strict schema validates them. Rejected alternative: `timestamptz` normalises the source offset to UTC and truncates beyond microseconds, while v1 date-times allow any number of fraction digits; `date` cannot hold every v1 calendar string either: the contract accepts `0000-01-01`, which PostgreSQL rejects as out of range. Server save time is a separate `owned_case.saved_at timestamptz`, and no incident time is ever derived from storage time. A document save stores the client's `updatedAt` unchanged, so map-only saves keep factual timestamps. Renaming from My cases counts as a committed edit and sets `updatedAt`.
- **Geometry.** Database X is longitude and Y latitude, in SRID 4326. A circle is an exact centre point plus `radius_meters double precision`, with no polygon approximation. A polygon is stored as a closed PostGIS ring (`ST_MakePolygon` requires one), keeping vertex order and winding. Decoding drops the repeated terminal vertex, so v1 keeps its open ring. Planned (`search_area.planned_*`) and actual (`area_check.actual_*`) geometry live in independent columns, and replanning never touches an actual snapshot.
- **Ordering and numbers.** Explicit `position` columns keep the order of points, entries per point, roles, areas, checks per area, photo references per record, captions and assets. Numeric values use `double precision`, which matches JS numbers exactly. Asset sizes and pixel dimensions use `bigint` read as JS numbers, safe up to 2^53 − 1.
- **Unstorable text (resolved v1 gap).** PostgreSQL text cannot hold U+0000, and UTF-8 encoding would silently replace lone UTF-16 surrogates. The user chose on 2026-10-30 to narrow the v1 contract: `textSchema` rejects both, so editors, JSON import and the API share one rule, and `case-json-v1.md` documents it. Rejected alternative: a reversible escape encoding, which would add a hidden transform to every text column.
- **Version and idempotency contract.**
  - Endpoints. `GET /api/cases` lists `{id, title, version, savedAt}`, newest save first. `POST /api/cases {title, timeZone}` creates an empty document with a server-generated UUID identity and version 1. `GET /api/cases/:id` returns `{document, version, savedAt}` plus an `ETag`.
  - Mutations. `PUT` (complete document), `PATCH {title}` and `DELETE` require `If-Match: "<version>"` (428 when missing) and an `Idempotency-Key`. One transaction locks the case row, rechecks the version, replaces the rows, increments the version and records the key. A stale version returns 412 `version_conflict` with the current version and writes nothing. Absent and foreign cases return the same 404 `not_found`.
  - Ledger. Each owner's ledger stores a request fingerprint and the committed acknowledgement. Retrying a committed key returns the original acknowledgement, even after newer versions exist. Reusing a key for different content returns 422. Concurrent duplicates collapse on the ledger key, and the losing transaction rolls back.
  - Browser. `persistence.serverVersion` and `persistence.unresolved` live in the store. When a response is lost (network error or 5xx), the attempt stays in `unresolved` and the one writer replays it with the same key before anything newer. A 412 becomes a conflict state, with no retry, for autosaves and replacement alike. `CaseCatalogue` applies the same key rule to create, rename and delete.
  - Identifiers. A route id PostgreSQL cannot compare (`%00`) returns the ordinary 404 `not_found` on every case route.
- **Root metadata.** The only document change the server makes is the case identity. Creation assigns the UUID, and JSON import into the open case replaces `case.id` with the target identity before validation. Other IDs and relationships are preserved within the case namespace. P07 owns the full importer; importing with no open case is disabled in P02.
- **Write atomicity.** One transaction does the whole replacement: it deletes the rows holding non-cascading references (observation links, escape, main photo), then deletes the case namespace, which cascades to every other document row, then inserts in foreign-key order. The delete order is explicit because PostgreSQL checks non-deferrable references between cascade steps. Save and delete share that one order; those four are the only non-cascading foreign keys inside the document model.
- **Browser.**
  - Routes. `/` shows My cases over the existing map; `/cases/:caseId` opens a case, with `/profile` beneath it.
  - Persistence. The IndexedDB single-snapshot adapter was removed because it was not account-keyed; P04 owns account- and case-keyed local retention. The user accepted this removal on 2026-10-30, and the unused `idb` and `fake-indexeddb` dependencies were dropped; P04 selects its own storage dependency. The store still keeps one committed document and isolated drafts, and the existing serialised writer now writes to the server through a stateless `CaseStorage` seam.
  - Acknowledgements. Each acknowledgement is tied to the captured revision and case-session generation, so a delayed response from a previous case cannot mark the current case saved.
  - Conflict and leaving. A conflict, including one from a replacement import, freezes automatic writes and further replacement and keeps the local committed data exportable. Leaving a case resolves a dirty draft and waits for pending saves, and the wait stops when the router cancels the navigation. If a save failed or conflicted, navigation stays on the case with retry and export available.
  - Unknown replacement outcome. If a replacement's response is lost, the server may hold the candidate. The store replays that attempt to learn its outcome, then saves the local document over it, so the server returns to what the screen shows.
  - Offline. Create and delete are disabled offline, with an explanation.
- **Technical bounds and cache.** The 10 MB JSON limit applies only to `/api/cases`; every other route keeps the 100 kB default. `express` became a direct dependency at the installed 5.2.1, because the scoped parser needs it. The parser runs before the authentication guard, so an anonymous caller can make the server parse up to 10 MB before the 401. `api:test`, `api:test-ci--src/cases.spec.ts` and `web-e2e:e2e` are uncached, so a cache hit cannot stand in for live-database evidence.

## Scope boundaries

P03 owns new photo binaries/access; P04 owns offline queueing; P05 owns user conflict resolution; P06–P08 own file transfers. This slice provides the full online persistence path and safe conflict rejection, not a substitute implementation for those tasks. Excludes field-level collaboration, history/version browsing, spatial analysis features, and schema changes to invent new domain facts.

## Delivery and review record

- Implementation: Claude sub-agent, 2026-10-30, branch `feat/p02-private-cases` (based on `origin/main` at `3a47d8f`). Schema migration `0001_owned_cases`, generated by drizzle-kit; P01's `0000_auth_session` is unchanged. Commit/PR: none. Changes are committed as `bce479e` through the normal hooks in [PR #21](https://github.com/Rizzlie/PawTrace/pull/21); the Nx checks below were run by hand before that.
- Key files: `apps/api/src/cases/` (`schema.ts`, `case-mapping.ts`, `case-repository.ts`, `cases.controller.ts`, `geometry-codec.ts`, `storable-text.ts`), `apps/api/src/database/`, `libs/shared/case-domain/src/lib/new-case.ts`, `libs/web/workspace/src/lib/cases/` (`case-api.ts`, `case-storage.ts`, `case-catalogue.ts`, `case-location.ts`, `connectivity.ts`), `libs/web/workspace/src/lib/my-cases/`, `with-case-persistence.ts`, `workspace.routes.ts`.
- Verification ran on real PostGIS and Redis from `docker compose -p pawtrace-p01-test -f compose.auth-test.yaml up -d --wait`.
- `npm exec nx run api:test -- src/cases.spec.ts --output-style=static`: 17/17 passed on the final code. Scenarios:
  - Two owners, with non-disclosing 404s on read, save, rename and delete.
  - Complete, minimal and an extra variant document, each reconstructed with `toStrictEqual`. The variant covers all event-time kinds, offsets `-03:30` and `+14:00`, nine fraction digits, a sparse profile with `false`/`null`/`[]`, empty/null/partial details, a rejected observation, non-UUID Unicode IDs, Unicode text, unavailable photo references, large `bigint` asset values and the map view.
  - The same fixture IDs in three cases without cross-talk; broken, cross-kind and duplicate references rejected.
  - Direct SQL that bypasses the validator cannot link another case's point or observation, or a non-observation entry: `case_escape_point_fk` and `area_check_observation_fk` both reject it (23503).
  - SRID 4326 with X = longitude (`151.2092959123456`), a 5-point closed ring returned as 4 open vertices, and an actual circle unchanged after replanning.
  - U+0000 and a lone surrogate rejected with `invalid_case`, while a valid surrogate pair (emoji) saves and reopens unchanged.
  - Stale save, rename and delete returning 412 with version 2; three racing saves producing exactly one 200.
  - Concurrent and repeated duplicate creates producing one case; a lost-acknowledgement replay returning the original version 2 after version 3 exists; key reuse 422; delete replay 204.
  - An injected trigger failure on the last-written table (500) leaving the previous document and version intact.
  - Application recreation preserving data.
  - Delete and replace of complete and variant documents, and delete with an observation preceding the point check and area search that link it, plus a main photo and caption.
  - An unstorable id (`%00`, `a%00b`) returning 404 on GET, PUT, PATCH and DELETE.
  - A 200 kB document accepted on the case routes, an over-10 MB document refused with 413, and a 200 kB body refused with 413 on `/api/auth/logout`.
- `CI=true NX_DAEMON=false npm exec nx run-many -- -t typecheck lint test build -p api web web-e2e workspace case-domain browser-persistence map-engine shared-ui --output-style=static --skip-nx-cache`: all 24 targets passed with no cache.
  - Tests: api 98 (81 earlier + 17 cases), workspace 85, case-domain 123, map-engine 35, web 2, browser-persistence 2 (a new map-help preference spec replaces the removed adapter's tests).
  - Lint: only the earlier `playwright/no-conditional-in-test` warning in `filters.spec.ts`.
  - The production web build reports the existing initial-bundle warning: 989.02 kB against the 500 kB warning budget, under the 1 MB error budget.
- `npm exec nx run web-e2e:e2e -- --workers=2 --reporter=line --output-style=static`: 83 passed, 3 skipped, 0 failed, on two consecutive runs of the final code after the review fixes (exit 0 both times). The skips are the three P03 photo-publication `fixme`s from P01. An earlier run timed out in the new three-context restart scenario at the default 30 s limit, so that test now has a 120 s budget. `my-cases.spec.ts` demonstrates:
  - Two browser contexts for one owner create, import, edit and reopen a case with an identical export.
  - A stale write in the first context shows the conflict state, and local data stays exportable.
  - A third owner gets "not found" at the direct URL, an empty list, and 404 on direct GET, PATCH and DELETE.
  - A host restart keeps the data.
  - Save indicator states: no open case, "Odczytywanie sprawy…" while a held read is pending, saving, saved, failure and conflict.
  - List states loading, empty, failure and retry; cancelled and confirmed rename and delete; a 503 delete leaving the case in place; offline create and delete disabled with an explanation.
  - "Zapisywanie na serwerze…" held until a delayed PUT is acknowledged, and failed-save recovery through "Ponów zapis".
- `npm exec nx format:check -- --base=origin/main`: exit 0. `npm exec nx run api:db-generate -- --output-style=static` against PostGIS 3.5.2: exit 0, "No schema changes, nothing to migrate", 2 applied migrations.
- Container recreation with the retained volume (run before the review fixes, which changed no schema): `docker compose -p pawtrace-p01-test -f compose.auth-test.yaml up -d --force-recreate --wait postgres` changed the container ID (`5c18f6fa172e` → `6c073ca36128`) on the same volume. Before and after: 301 cases, 472 points, 313 area checks, 73 users, 2 applied Drizzle migrations, and an identical id/version/title digest `0f5622decdb79f62bca1a19e5c4fd91e`. The pre-review test runs then passed against this recreated container, which was later stopped and restarted for the review fixes.
- Standards review: done by this session's independent review subagent; findings resolved, 2026-10-30.
  - `cases/case-storage.ts` kept `versions` and `uncertain` Maps and a replay-then-send path, breaking ADR 0004 and acting as a second queue. Fixed: both moved to `CaseState.persistence`, the adapter is stateless, and replay runs through the one writer. Moving them exposed a further bug, also fixed: `isUncertainOutcome` treated a `VersionConflict` as uncertain.
  - `flush()` could not be cancelled, so `leaveCase` kept waiting after the router aborted. Fixed: it takes the guard's `AbortSignal`.
  - `my-cases.ts` `submit()` owned the idempotency-key lifecycle and HTTP-status mapping. Fixed: both moved to `CaseCatalogue`, which uses `isVersionConflict`.
  - `frontend.md` still said the server does not persist the case. Corrected.
  - Smells fixed: `saveNeedsAttention` computed, `forSession` generation guard, `present` sparse projection, shared `Coordinates` type, `caseLocation` helper, `returnToCase` for repeated navigation, `mutationHeaders` naming.
- Specification review: done by this session's independent review subagent; findings resolved, 2026-10-30. The first delete box was ticked while this was false, for the reason in the first item below; it is true now.
  - HIGH: `CaseRepository.delete` bypassed the delete order, so a case with an observation before its linked check could not be deleted (500 on `point_check_observation_fk`). Reproduced first with failing tests on real PostGIS. Fixed: save and delete share `deleteDocumentRows`.
  - A 412 during replacement import showed a generic retry and never set `conflict`. Fixed: it reports a conflict and blocks further replacement.
  - `GET /api/cases/%00` returned 500. Confirmed by a failing test. Fixed: `StorableCaseId` returns the 404 on all four id routes.
  - The 10 MB limit applied to every route. Fixed: scoped to `/api/cases`. The first attempt silently removed JSON parsing elsewhere, because Nest skips its default parser once one exists; the test caught it and the default is now registered explicitly.
  - `browser-persistence/vite.config.mts` carried unrelated quote reformatting. Fixed: fully reverted, which also drops `passWithNoTests`; the library now has a real spec instead.
  - The review list received by the implementer had no item numbered 2, so nothing was recorded or actioned under that number.
  - Test order: the API findings were failing tests first. The tests for the replacement conflict, cancellable `flush`, store replay and `CaseCatalogue` were written with their fixes and were not separately run red.
- Final verification after the user's decisions (2026-10-30, moving the text rule into `textSchema` and dropping `idb`/`fake-indexeddb`): `nx run-many -t typecheck lint test build --skip-nx-cache` on all 8 projects exited 0; `nx run web-e2e:e2e -- --workers=2` passed 83 with 3 skipped; `db-generate` reported no schema changes. These changes and the review fixes were not independently re-reviewed.
- Remaining blockers/limitations: no incomplete field mapping is known. Limitations:
  1. Text with U+0000 or a lone surrogate is rejected by the v1 contract, so a v1 file containing it no longer imports (see the decision record).
  2. Pending edits live only in memory. If a save fails, leaving the case is blocked, but a reload loses unsaved edits. P04 adds durable local retention and P05 the conflict choice.
  3. JSON import needs an open case and otherwise stays as in the MVP; P07 hardens it.
  4. Photo filenames are references only; every asset route stays denied until P03.
  5. The `case_mutation` ledger and P01 session tombstones are never pruned.
  6. If a replacement's response is lost and the follow-up saves also fail, the server may keep the candidate until the next successful save; the status stays unsaved meanwhile.
  7. The production `compose.yaml` stack was not started. Recreation evidence uses the test compose project and in-process application recreation; P10 owns the production-like Compose acceptance.
