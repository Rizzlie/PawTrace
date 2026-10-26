# Frontend technology and browser persistence feasibility

Parent: ../map.md
Label: wayfinder:research
Type: research
Status: resolved
Assignee: macsy
Blocked by: none

## Question

Which current primary-source mechanisms support the proposed Angular/Nx/Leaflet frontend, runtime case-JSON contract, and browser persistence? Compare a focused Angular signals service and NgRx SignalStore at the interface/ownership level, stable form options, schema-driven TypeScript validation with Zod, and transactional IndexedDB snapshots with a small adapter. Investigate immutable updates, computed projections, async ordering and stale-save acknowledgement, strict unknown-field handling, schema versus cross-record validation, structured-clone behavior, and practical Leaflet scene/event/edit isolation. Identify actual caveats and deferred integration checks without prescribing unapproved product behavior or building a generic engine.

## Comments

Research output only: `../research/frontend-technology-feasibility.md`. Read the current JSON and lifecycle decisions plus the F04/F05 task documents. No installation, application implementation, prototype edits, commits, branches, pushes, PRs, or further delegation. The parent owns all decision and architecture documents.

Active T3 research task: `node:delegated-task:command%3Amcp%3A62624c61-c925-4ae4-a971-a52ff7bec9d9%3Adelegate-task%3Apawtrace-frontend-architecture-research-20261026-round1`. Do not launch a duplicate while it is running.

## Answer

The research completed and the parent reviewed [Frontend technology and browser persistence feasibility](../research/frontend-technology-feasibility.md). The note contains the primary-source findings, candidate approaches, caveats, and deferred checks; recommendations are not user-approved architecture decisions.

Key verified implementation pitfalls include deep mutation despite readonly signals, Zod's default unknown-key stripping unless strict object schemas are chosen throughout, and transaction completion rather than individual request success as the persistence acknowledgement. IndexedDB atomicity does not replace application-level revision/write ordering, and plugin edit events are not application confirmation. Current form stability and compatibility must be checked for the selected Angular baseline rather than inferred from older experimental labels.

The user has already selected one application state, a Leaflet-isolating module, matching nested case/JSON data, Zod, and rejection of unknown import fields. Remaining architecture choices belong to [Frontend architecture, map integration, and case document lifecycle](15-frontend-architecture.md). No implementation or Git operations were performed.
