# Technical feasibility of maps and photo storage

Parent: ../map.md
Label: wayfinder:research
Type: research
Status: resolved
Assignee: macsy
Blocked by: 04, 07, 08

## Question

Context: [Map use in the field and on desktop](04-map-capabilities.md), [Server photo handling](07-photo-assets.md), [Constraints for map services and hosting](08-service-constraints.md).

Which map-service and application-architecture options satisfy the agreed MVP requirements and budget, scale, and hosting constraints? Use primary documentation to compare street maps, satellite or aerial imagery, address search, phone geometry drawing/editing, licensing terms, and fees. Investigate persistent server assets, multiple-photo uploads, HEIC alongside JPEG/PNG/WebP, original preservation, thumbnail generation, unique filenames, restoring references from JSON, and actual transfer/storage constraints without product-level limits. Identify requirement/capability mismatches and options for user decisions. Do not implement the application or choose product compromises for the user. A subagent using the research skill must perform the investigation only after dependencies are resolved; research-branch and publication requirements follow the wayfinder skill.

## Comments

All dependencies resolved. Binding constraints: local Docker, Poland, personal use and a few testers, free services only; OSM proposed by the user. Also check official Polish orthophoto sources, public Nominatim rules (including manual search versus autocomplete), phone geolocation when accessing a local server, and Docker asset persistence. The user's no-new-commits instruction overrides wayfinder's branch and push requirements. Save findings locally in Markdown, without commits, pushes, or PRs.

Research launched as T3 task `node:delegated-task:command%3Amcp%3A62624c61-c925-4ae4-a971-a52ff7bec9d9%3Adelegate-task%3Apawtrace-wayfinder-technical-research-20261026-round1` (provider `codex`, model `gpt-6.1-sol`). Output note: `../research/technical-feasibility.md`. The parent reviews the result and resolves the ticket; the subagent writes only the note. Do not duplicate this research while the task is still running.

## Answer

Research completed and reviewed by the parent. Full findings, sources, the distinction between facts and proposals, and verification limits: [PawTrace MVP — technical feasibility](../research/technical-feasibility.md). The note is the single location for detailed results; no implementation or commits were made.

Conclusion: there is a documented path to a free Docker MVP with OSM, Polish orthophotos, local assets, and HEIC decoding. The specific integration and target devices need later verification. The research is neither user approval of service selection nor confirmation of a working application.

The findings clarified decisions about phone access and HTTPS, public OSM/Nominatim selection, HEIC previews, thumbnail-generation errors, and a persistent photo directory. These resolutions belong to [Local MVP architecture and technical trade-offs](10-local-architecture.md).
