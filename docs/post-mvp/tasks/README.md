# Shared-instance release tasks

The user confirmed the product scope and chose specification and task documents in the repository. [Specification](../spec.md) defines the release; [planning](../planning.md) records the interview. This directory is the new task tracker. Earlier MVP tasks do not define the structure or quality bar of these tasks.

Status: **proposed breakdown awaiting review**. All tasks are `proposed`, not implemented or unconditionally ready for an agent. Confirm the granularity, blocking edges and specification testing seams before promoting the breakdown to `planned`. A later instruction to implement a task authorizes only that task, not all of its dependencies or the complete release.

## Proposed task graph

| ID  | Task                                                                                               | Blocked by    | Demonstrable result                                                                                                   |
| --- | -------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------- |
| P01 | [Google login and durable private session](P01-google-login-and-session.md)                        | None          | Sign in, enforce optional admission, remain signed in, expire after seven inactive days and log out.                  |
| P02 | [Private case catalogue and relational save](P02-private-cases-and-relational-save.md)             | P01           | Create a case, edit existing domain data, reopen it from PostgreSQL/PostGIS on another browser, rename and delete it. |
| P03 | [Private case photos](P03-private-case-photos.md)                                                  | P02           | Upload, attach and view originals/derivatives as the case owner; another user cannot access any asset route.          |
| P04 | [Durable offline autosave and account-safe recovery](P04-offline-autosave-and-account-recovery.md) | P02           | Edit through a disconnection, retain work per case/account, resume safely and clear local copies on explicit logout.  |
| P05 | [Version conflicts and deleted-case recovery](P05-conflicts-and-deleted-case-recovery.md)          | P04           | Choose local/server versions or recover a remotely deleted case without silent overwrites.                            |
| P06 | [Complete JSON and ZIP export](P06-json-and-zip-export.md)                                         | P03           | Download complete committed data and original bytes; retain JSON recovery when a full ZIP cannot be produced.         |
| P07 | [Safe JSON import and replacement](P07-json-import-and-replacement.md)                             | P06           | Import the user's MVP JSON into a new or open case, with confirmation and safe replacement.                           |
| P08 | [Complete ZIP import and replacement](P08-zip-import-and-replacement.md)                           | P07           | Restore originals and relations atomically from an archive without merging or affecting another case.                 |
| P09 | [Light visual polish](P09-light-visual-polish.md)                                                  | None          | Improve spacing/alignment of existing shared controls and workspace without changing its layout.                      |
| P10 | [Release acceptance and Compose recovery runbook](P10-release-acceptance-and-runbook.md)           | P05, P08, P09 | Prove the combined workflow in Compose, including isolation, restart, backup/restore and failure recovery.            |

The graph lists direct gates only; transitive prerequisites are implicit. P03 and P04 can proceed independently after P02. P06–P08 do not require offline editing and can proceed independently of P04–P05. P09 can start immediately because it adjusts existing shared visual primitives; new screens use those same primitives. P10 depends transitively on all earlier tasks. No task authorizes public rollout of an incomplete integration.

## Execution and completion

1. Read the requested task, the linked specification sections, the glossary and relevant ADRs. Inspect actual prerequisite delivery records and code, not only the index.
2. Implement one complete behavior slice across the layers it needs. The first login slice includes minimal database/runtime support because a persistent session must be demonstrable; P02 includes mapping and existing editor integration rather than separate schema-only/API-only tasks.
3. Keep the existing committed-document and isolated-draft contract. Follow declarative state principles and preserve existing case semantics.
4. Discover current Nx projects and targets with `npm exec nx show projects -- --json` and `npm exec nx show project <project> -- --json`. Run relevant `typecheck`, `lint`, `test` and `build` targets with workspace-local Nx and affected browser scenarios through `web-e2e:e2e`. Use finite CI/test execution as supported by the resolved target; do not invent flags or new target names.
5. For persistence work, execute integration tests against actual PostgreSQL/PostGIS and temporary original storage. Ensure Nx inputs/cache policy accounts for integration setup so stale cache hits are not mistaken for live database evidence. Browser tests must authenticate through a test-only controlled provider, without enabling a production bypass.
6. Resolve the task's implementation discussion topics within the approved product boundaries; record the choice, rejected alternative if meaningful, and evidence. Reopen user decisions only for a real scope change. Do not treat discussion topics as silently accepted technology choices.
7. Record exact commands, results, user-observable evidence, branch/commit/PR, outstanding checks, and review findings. Use `blocked` when a required check cannot be completed. Mark `done` only after acceptance and verification pass; task dependencies do not waive unavailable live checks.
8. Follow [the contribution workflow](../../../CONTRIBUTING.md): dedicated branch, normal hooks, Conventional Commits, push and PR against `main`, leave merging to the user. Record standards/spec review with findings resolved; a planning PR does not count as implementation review.

## Required task format

Every task has exactly these second-level sections, in this order:

1. Assumptions and sources
2. Scope
3. Acceptance criteria
4. Verification steps
5. Discussion topics and decision record
6. Scope boundaries
7. Delivery and review record

Status and blockers are metadata above the sections. Acceptance criteria describe observable pass/fail outcomes. Verification steps specify scenarios, failure cases and evidence, rather than merely saying “write tests.” Delivery/review fields start explicitly unfilled. The source links and task-specific decisions make each task usable in a fresh implementation session.

## Coverage

- Authentication, session and admission: P01; expiry/local recovery and explicit logout: P04; integrated proof: P10.
- Catalogue, relational full-document mapping, geometry and version-checked online writes: P02.
- Original/derivative privacy and ownership: P03; archive export/import: P06–P08.
- Offline durability, stale acknowledgements and account separation: P04; conflict and deletion recovery: P05.
- Existing MVP JSON transfer without legacy migration: P07. Complete portable archives: P06 and P08.
- Spacing and shared visual consistency: P09, with new screens already using the existing theme in their own tasks.
- Docker migrations/readiness: P01–P02; persistent media runtime: P03; full-instance backup/recovery and final acceptance: P10.
