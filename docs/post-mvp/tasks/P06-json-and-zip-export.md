# P06 — Complete JSON and ZIP export

Status: planned; implementation not started.
Blocked by: P03 — Private case photos.

## Assumptions and sources

- Read [the specification](../spec.md): Photos and transfer format, and [execution rules](README.md). [JSON v1](../../architecture/case-json-v1.md) defines complete committed data and excludes drafts/filters.
- The user wants full JSON plus original photos for later manual analysis. No automatic analysis integration or ChatGPT archive compatibility guarantee is required.
- P02 supplies relational reconstruction/owned documents and P03 supplies authorized, immutable original access. JSON-only local recovery already exists; full offline ZIP generation is not promised.

## Scope

Deliver JSON and complete ZIP download from the case UI. The ZIP has root `case.json` and original bytes under `photos/<logical-original-filename>`, deduplicated by logical original within that case. Include originals referenced by any attachment or listed as assets, preserving JSON relationships. Generated previews/thumbnails are not required in the archive.

Capture one committed document revision and the originals authorized for that case. Include committed pending local data where available, or prevent an older server archive from being presented as the latest local content. Preserve the JSON export path when full originals cannot be reached. Report missing/unreadable filenames rather than presenting an incomplete ZIP as a full export. Downloads must not mutate case factual metadata, mark pending edits synchronized, or include incomplete editor drafts.

## Acceptance criteria

- [ ] JSON export validates as v1 and preserves complete committed data reconstructed from the relational model, including hidden/rejected records and attachment relations.
- [ ] ZIP contains one root `case.json` and every distinct required original; original bytes match the stored source, including HEIC. No session/owner secrets or unrelated case files are included.
- [ ] Export under filters or with an open draft includes the same committed data and visibly explains draft exclusion. Export timestamps do not alter stored factual timestamps or save status.
- [ ] Pending committed edits are either included consistently or clearly block an outdated full ZIP; a mid-export save cannot mix incompatible case/photo revisions.
- [ ] Missing or unreadable originals produce an actionable failure and JSON-only recovery option. Unreachable originals offline never yield a falsely complete archive.
- [ ] Anonymous/foreign-owner export and forged original references are denied; repeated filenames from another case cannot leak its bytes.
- [ ] Download cancellation or archive-generation failure leaves case data and photos unchanged and can be retried.

## Verification steps

1. Run relevant Nx contract/API/workspace/browser checks. Export from a real database and temporary asset directory; inspect the downloaded ZIP independently of the exporter.
2. Compare the complete fixture's JSON semantics and each original hash. Cover every attachment location, unreferenced manifest originals, HEIC and a file with no known derivative.
3. Repeat under filters, a dirty editor, committed-but-unsynchronized local changes and a concurrent server update. Verify capture consistency and unchanged save acknowledgements.
4. Remove or deny one required original, interrupt reads and cancel a download. Assert no complete-success report, retained data and a usable JSON fallback.
5. Attempt exports as anonymous/another owner and forge a filename from their case. Inspect archive paths for unexpected entries and compare separate-case filename collisions.

## Discussion topics and decision record

- Settled: v1 JSON plus original bytes, one consistent committed snapshot, JSON-only fallback, no bundled derivative requirement.
- Record: archive library, bounded streaming/memory strategy, original enumeration, missing-file reporting and local/server snapshot capture. Preserve filenames logically while keeping internal paths private.
- An analysis service integration or additional lossy conversion is outside the agreed transfer contract.

## Scope boundaries

Import is delivered by P07/P08. No generated report, image conversion for analysis, full-instance backup in a case archive, or guarantee of offline original availability. P10 documents database-plus-files backups separately.

## Delivery and review record

- Implementation: not started; record implementer/date, archive contract, branch/commit/PR.
- Verification: pending; add downloaded archive inventory, semantic comparisons, byte hashes and missing-file/concurrency/authorization results.
- Standards review: pending; record streaming/resource and state-boundary findings/resolutions.
- Specification review: pending; review completeness and truthful fallback behavior explicitly.
- Remaining blockers/limitations: record any unverified original format or download path before marking done.
