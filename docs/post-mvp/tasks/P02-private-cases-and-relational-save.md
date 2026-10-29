# P02 — Private case catalogue and relational save

Status: proposed; implementation not started.
Blocked by: P01 — Google login and durable private session.

## Assumptions and sources

- Read [the release specification](../spec.md): Relational case persistence and spatial data; Ownership, catalogue, and API behavior; Autosave, offline work, and conflicts. Read the [task execution rules](README.md).
- [ADR 0005](../../adr/0005-store-cases-relationally-in-postgresql-and-postgis.md) selects relational PostgreSQL/PostGIS, not a whole-case JSONB row. [JSON v1](../../architecture/case-json-v1.md) and its executable complete/minimal fixtures define existing data semantics.
- The existing [frontend architecture](../../architecture/frontend.md) and [committed-document ADR](../../adr/0002-one-state-with-document-only-persistence.md) preserve committed data separately from drafts and derived UI state.
- PostGIS references: [coordinate order](https://postgis.net/docs/ST_MakePoint.html) and [SRID](https://postgis.net/docs/ST_SetSRID.html). P01 supplies authenticated identity, migrations and durable database/runtime support.

## Scope

Deliver My cases and the complete online path from creating a private case through editing existing profile/map/history/search workflows to reopening it on another browser. Add list/create/open/rename/confirmed-delete UI and owned case API. Persist the full committed domain through relational mappings in one transaction, including optional values, event-time variants, relationships, attachment references and map view. Add PostGIS storage without changing circle/polygon meaning or actual-search snapshots.

Wire existing committed-change events to online autosave with a truthful server acknowledgement and a storage revision separate from domain timestamps. Enforce optimistic concurrency on save, rename and delete from the first implementation; a stale mutation preserves local committed data and reports a conflict rather than retrying blindly. P05 adds the complete conflict-choice workflow. Handle lost mutation responses with idempotency/reconciliation so retrying a successful request does not duplicate cases or overwrite a newer revision.

Photo references may remain unavailable placeholders; knowing a filename does not grant ownership of an existing server image. P03 enables case-owned photo uploads and reads. Keep that delivery boundary visible without dropping existing document fields or accepting them and silently discarding them.

## Acceptance criteria

- [ ] Owner A can create two named cases, open each, rename one and delete it after confirmation; owner B cannot list, read, mutate or delete either by direct API calls.
- [ ] Editing and reopening preserves every existing v1 domain field and relationship, including all history/check variants, rejected observations, optional/null/false values, Unicode, photos-as-references and map view.
- [ ] Relational reconstruction passes the existing strict case schema. No full-case JSON/JSONB database field substitutes for the relational model.
- [ ] Positions use longitude/latitude correctly; circles retain exact center/radius, polygons preserve the v1 open ring, and actual searched geometry does not change when its plan changes.
- [ ] Non-UUID textual identifiers work. Two cases can contain the same imported source IDs without collision or cross-case links. Invalid or cross-case observation/escape references cannot be committed.
- [ ] Date-only, unknown and approximate event times retain precision/descriptions; offsets and list ordering survive where exposed by the contract. Storage time never invents an incident time.
- [ ] A failed candidate write leaves the prior complete case intact. Stale save/rename/delete requests are rejected atomically; retries after a lost acknowledgement do not duplicate creation or bypass versions.
- [ ] Only committed data saves. A response acknowledges the captured case/revision; switching cases or receiving delayed responses cannot mark unrelated state saved. Map-only saves do not alter factual case timestamps.
- [ ] Creation/deletion are unavailable offline with an explanatory state. The list and save indicator distinguish loading, empty, failure and success.
- [ ] Database/application/container recreation with retained volumes preserves cases and relational migrations. The UI never claims server success before commit acknowledgement.

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

## Scope boundaries

P03 owns new photo binaries/access; P04 owns offline queueing; P05 owns user conflict resolution; P06–P08 own file transfers. This slice provides the full online persistence path and safe conflict rejection, not a substitute implementation for those tasks. Excludes field-level collaboration, history/version browsing, spatial analysis features, and schema changes to invent new domain facts.

## Delivery and review record

- Implementation: not started; record implementer/date, schema/migration version, branch, commit and PR.
- Verification: pending; attach command results, full-field round-trip evidence, concurrency/rollback cases and two-owner browser demonstration.
- Standards review: pending; record declarative-state and module-boundary findings/resolutions.
- Specification review: pending; account for every v1 field and each acceptance criterion.
- Remaining blockers/limitations: record any incomplete field mapping or external check explicitly; incomplete mappings prevent completion.
