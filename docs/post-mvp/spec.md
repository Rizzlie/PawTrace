# PawTrace — shared-instance release

Status: product scope confirmed by the user; specification and task breakdown proposed for review. Application implementation is not started by this document.

## Problem Statement

The MVP keeps one case in one browser, with manual JSON transfer and photos stored separately on a local server. A user cannot sign in, select their own saved cases, or reliably move a complete case with its original photos. The next release must make existing search workflows usable in one shared instance while keeping every case private and protecting work during interrupted connections.

## Solution

Require Google sign-in, provide a private My cases list, and save committed case data automatically in relational PostgreSQL with PostGIS. Keep originals in persistent server storage with ownership checks. Use IndexedDB to retain pending edits when connectivity fails, and synchronize with explicit version conflict resolution. Transfer cases through JSON or a ZIP containing the complete JSON and original photos. Refine spacing in the existing interface without redesigning the map workflow.

## User Stories

1. As a user, I want to sign in with Google so that I can access my private cases.
2. As an operator, I want an optional email allowlist so that I can restrict access or admit any authenticated Google account when it is empty.
3. As a user, I want to remain signed in across browser restarts so that I do not repeat login during normal use.
4. As a user, I want login to expire after seven days without authenticated API use so that an unused session does not remain active indefinitely.
5. As a user, I want to create and name several cases so that separate disappearances remain separate.
6. As a user, I want to list, open, rename, and delete my cases so that I can return to the right search.
7. As a case owner, I want other users to be unable to read or change my case or its photos so that the information remains private.
8. As a user, I want all existing profile, point, history, area, check, and map-view data to survive reopening on another device so that the existing MVP remains useful.
9. As a user, I want committed changes saved automatically so that I do not manage files during normal work.
10. As a user, I want distinct local and server save indicators so that I know whether another device can load my latest edits.
11. As a user, I want pending edits retained in IndexedDB during a connection failure so that I do not lose work.
12. As a user, I want edits synchronized after reconnection so that my server copy catches up.
13. As a user, I want pending edits stored separately per case and account so that switching cases or accounts does not mix data.
14. As a user, I want to choose a version when another device or tab changed the case so that synchronization does not silently overwrite work.
15. As a user, I want to export my local version before resolving a conflict so that I can retain both versions.
16. As a user, I want recovery options when the server case was deleted while I edited offline so that my local work is recoverable without silently restoring the deleted case.
17. As a user, I want to upload photos while online and view authorized originals and derivatives so that existing photo workflows remain available.
18. As a user, I want an export containing the full committed case regardless of filters so that later analysis receives all recorded facts.
19. As a user, I want a ZIP containing JSON and original photo bytes so that I can transfer a complete case for later manual analysis.
20. As a user, I want to import my existing MVP JSON so that I do not need a separate installation migration.
21. As a user, I want to import ZIP or JSON over the open case after confirmation so that I can replace its contents without creating another case each time.
22. As a user, I want invalid or failed imports to leave the current case unchanged so that replacement is safe.
23. As a user, I want an import with no open case to create a new private case so that I can start from a file.
24. As a user, I want missing-photo warnings for JSON imports so that references are not mistaken for available files.
25. As a user, I want session expiry to preserve pending edits so that logging in again on the same account can resume synchronization.
26. As a user, I want explicit logout to warn about pending edits and remove local case copies after confirmation so that a shared device does not retain them in the application.
27. As a user, I want clearer spacing and consistent controls so that the current interface is more comfortable to use.
28. As an operator, I want Docker Compose startup and a tested database-plus-files backup procedure so that the shared instance remains recoverable.

## Implementation Decisions

### Authority and scope

The confirmed [planning record](planning.md) is the source of product decisions. This specification makes their technical consequences explicit. The [task index](tasks/README.md) proposes the delivery slices and verification seams; approving the product scope did not imply implementing these tasks in this documentation change. Existing MVP behavior remains the baseline except where this specification supersedes single-browser persistence and unauthenticated assets.

### Authentication and session

- Use Google OpenID Connect authorization code flow with PKCE S256, state and nonce validation, and backend token validation. Request only the identity scopes needed for login. Identify the account by issuer and stable subject; email is an admission attribute, not its primary identity.
- Establish a server-side PawTrace session, backed by PostgreSQL and an opaque HttpOnly cookie. Production cookies require HTTPS, Secure and an appropriate SameSite policy; mutating requests also require CSRF/origin protection. Use a maintained implementation rather than custom cryptography. Token exchange secrets remain server-side. Google refresh tokens are not needed solely to keep the application session alive.
- Persist login across browser restarts. The timeout is seven days since the last accepted authenticated API request, measured by server time. Reject an already expired session before updating its activity. Static files, health probes, rejected credentials, and anonymous requests do not extend it. Authenticated automatic API requests do count, as the user explicitly selected endpoint activity. There is no retained 30-day absolute limit in the agreed policy.
- Renew cookie expiry consistently with server expiry. Periodic session identifier rotation must tolerate overlapping requests and tabs without extending an expired or revoked session. Explicit logout revokes the server session; a restart does not revive it. Session material is not persisted in browser JavaScript storage.
- Enforce the optional allowlist on the backend using verified Google email: empty admits any authenticated Google account; populated admits only matching addresses. The Google Console test-user list is not an application authorization boundary.
- Session expiry retains local edits but stops server access. Synchronization resumes only after the same account authenticates. A different account cannot see, export, or synchronize the previous account's cached cases.

### Relational case persistence and spatial data

- Use relational PostgreSQL tables for users, sessions, cases, the animal profile, points, roles, history variants, areas, checks, event-time values, attachments, and photo metadata. The full case is not stored as a JSON/JSONB document. Choose the SQL access/migration tooling during the first database slice and record its rationale; no ORM has been selected in the interview.
- Keep the framework-neutral case contract independent of database entities. API adapters reconstruct and validate the committed document; writes validate the entire candidate and map it into relational rows in one transaction. An HTTP JSON document is a transport, not the database representation.
- Preserve all v1 fields, optional-versus-null semantics, nullable booleans, order where observable, time precision, original time descriptions, and relationships. Do not invent instants for date-only or unknown events. Retain source offsets where the file contract exposes them rather than accidentally losing them through timestamp conversion.
- Scope imported record identifiers to their case. V1 accepts nonempty text identifiers, not just UUIDs. Importing the same source into another private case must not collide with database-global point/history identifiers or grant cross-case access. Validate document-wide uniqueness and constrain relationships to the owning case.
- Use PostGIS spatial columns with SRID 4326 for geographic positions and polygons. Database X is longitude and Y latitude. Retain circles as their exact center and radius in meters, not just a polygon approximation. Preserve open-ring ordering and shape kind on reconstruction; closing the database ring must not add a duplicate terminal vertex to exported v1 data. Planned geometry and actual-search snapshots remain separate.
- Retain one committed document in the existing browser state architecture and isolated editor drafts. Derived state remains declarative. Persist committed changes, not incomplete drafts, filters, selection, or editor state. Map-view changes can change a storage revision without changing factual incident timestamps.

### Ownership, catalogue, and API behavior

- Each case has exactly one owner. The list contains only that owner's cases and supports creation, opening, renaming, and confirmed deletion. Creating, deleting, and importing require a connection. Renaming is a committed case edit subject to the same save/version rules.
- Every case read, write, delete, import, export, upload, image read, processing-status read, and retry checks session and ownership on the server. Opaque identifiers or filenames are not access grants. A foreign or absent resource receives a consistent non-disclosing response.
- Keep authentication/ownership and server revision outside the strict v1 file document. Case reads return the document and a concurrency version. Mutations and replacement carry the version they are based on; stale writes are rejected without a partial update. Recheck the version transactionally at commit.
- Server acknowledgements distinguish a document's factual timestamps from server save time. A response acknowledges the captured case, account, session generation, and local revision; an old request cannot mark a new case or account saved.
- Acknowledgement loss must not cause blind overwriting or duplicate creation. Implement an idempotency or reconciliation mechanism for retried mutations, including import/create, and test it through the API boundary.

### Autosave, offline work, and conflicts

- Save each committed change to account-and-case-keyed IndexedDB and synchronize it to the server when possible. Track the last acknowledged server version and the pending local revision. A server-saved indicator requires server acknowledgement; a successful local write alone means saved on this device, pending synchronization.
- Retain the existing serialized/coalescing writer behavior with generation-aware acknowledgements. Keep a durable recovery path when local storage fails; do not claim persistence. Preserve the latest in-memory committed data and allow JSON export even when storage or networking fails.
- Offline support means continuing data/geometry edits in an already running application. Application startup from scratch offline, tile downloads, new photo uploads, and creating/deleting/importing cases are outside this support. Case switches must retain pending edits; do not require uncached remote data to be available offline.
- Reconnection synchronizes only against the known server version. On a conflict, freeze automatic replacement and offer local-versus-server selection with save-time context and local data export. Recheck if the server changes again while the choice is open. Both local and server values remain recoverable until the choice succeeds. There is no field-level or record-level merge.
- A remotely deleted case is a distinct recovery condition: export local data or save as a new private case online. Do not silently recreate the old identity or copy inaccessible photo assets.
- Explicit logout warns when local changes are pending, offers cancellation or data export, revokes the server session, and clears application case copies and queued writes across tabs after confirmation. Do not report successful server logout when revocation failed, or allow an old in-flight write to repopulate cleared storage. Expiry is distinct and does not clear pending edits.

### Photos and transfer format

- Keep original bytes and generated derivatives in a persistent Docker-mounted directory. Relational metadata scopes assets to their case/owner. Internal storage locations are independent of untrusted imported filenames; repeated logical filenames in different cases cannot collide or bypass ownership. Keep the existing original/HEIC/thumbnail/preview workflow.
- JSON export uses the existing strict, versioned contract and contains all committed data regardless of filters. Keep JSON-only export available for offline recovery; it does not promise embedded photos or include uncommitted editor drafts.
- A ZIP contains exactly one root `case.json` plus originals under `photos/<logical-original-filename>`. The JSON retains the v1 contract, including attachment relationships. Original photo bytes remain unchanged. Server-generated derivatives need not be bundled; regenerate them after import and update their server metadata.
- A complete ZIP export must include every distinct original referenced anywhere in the case or listed in its asset manifest. If an original is missing or unreadable, report the filenames and do not label an incomplete archive as complete. Offer JSON-only export instead. Offline recovery always has a JSON path; full ZIP export is not guaranteed while originals are unreachable.
- Prepare the ZIP JSON and originals from a consistent committed case revision. Either capture local pending committed data with authorized originals or prevent an outdated server ZIP from being presented as including those edits. Export does not change case timestamps or acknowledge unsaved edits.
- Import JSON or ZIP into the open case after a summary and explicit replacement confirmation with a prior-export option. Retain the target case identity and owner; the source owner/session/version is never trusted. Other domain IDs and relationships are preserved within the target case namespace. Define any necessary target-root metadata remapping explicitly in the importer and its round-trip assertions.
- With no open case, import creates a new private case with a new target identity, without overwriting another case that happens to share the source identifier. Repeated imports over an open case replace content rather than creating copies.
- Parse, validate, and stage the full candidate before committing replacement. Coordinate database rows and file publication so a failure leaves the old case and its readable originals intact. Filesystem writes are not falsely described as part of a PostgreSQL transaction: stage originals first, commit validated references atomically, and safely clean abandoned staging data. A version change during preparation requires the existing conflict path.
- Reject corrupt ZIPs, unsafe paths, duplicate/ambiguous entries, unsupported versions, invalid references, and missing required originals before activation. Bound archive processing resources and document the chosen technical limits; no business quota has been agreed. Reject oversize archives with an actionable error before replacing data.
- JSON-only import can retain unavailable-photo placeholders and warnings. A filename matching another user's asset never attaches that asset. Keep already owned target originals only when their association can be established safely; foreign or legacy references alone are not evidence of ownership. A damaged ZIP does not silently degrade to a JSON import.
- Deletion or replacement cannot remove originals needed by the last committed case, another case, or an active staged operation. Define safe cleanup/recovery in the photo and importer slices. Shared-instance backups cover both the database and original-photo directory, taken consistently.

### Runtime and visual scope

Continue Docker Compose with PostgreSQL/PostGIS and the existing application, asset directory, and address-cache Redis. Configure database migrations, readiness, private credentials, cookie/callback settings, and persistent volumes. The existing evictable Redis address cache is not the session store. Preserve development and production-container workflows. Hosting purchase, public deployment, domain choice and live credentials are deferred.

Visual work adjusts spacing, alignment, density, and consistency using the existing shared theme and components. Preserve map-first layout, existing workflows, keyboard access, labels, and reachable controls. New login/catalogue/import states use that visual language; this is not a branding or navigation redesign.

## Testing Decisions

These seams are proposed for the user's final review alongside the task graph:

1. **Primary: authenticated HTTP behavior over real PostgreSQL/PostGIS and a real temporary asset directory.** Verify ownership, transactions, geometry reconstruction, version checks, import failure recovery, and original bytes through the application boundary. Use two identities and direct API calls, not only hidden UI controls. Do not replace relational/spatial semantics with mocked repositories or SQLite.
2. **User acceptance: existing Playwright browser boundary against the actual application/API.** Extend case-persistence, profile, point/history/area, photo, and MVP acceptance scenarios. Use independent contexts for accounts/tabs/devices, real IndexedDB, real downloads, connection interruption, and storage failure injection. Stub external maps/geocoding where appropriate; the application API under acceptance is real.
3. **Focused existing seams:** shared strict case-contract fixtures for relational/JSON round trips, existing snapshot-writer/store tests for delayed acknowledgements and revisions, and existing image-processing tests for derivatives and original preservation. Add tests only for meaningful behaviors, not table layouts or implementation call sequences.

Use a controlled OIDC provider/JWKS and injectable server time for deterministic authentication/expiry tests. Test invalid signature/issuer/audience/nonce/state/PKCE and disallowed email, without a production login bypass. A small real-Google smoke check is separately required when credentials exist; deterministic tests do not prove live Console setup. Explicitly record unavailable live checks rather than claiming they passed.

Run appropriate tasks through workspace-local Nx. The task index explains how to discover current targets and record exact commands/results. The release acceptance requires a production-like Compose run, database restart/recreation, and restoring database plus photo backup; mocked browser requests alone are insufficient.

## Out of Scope

- Shared case editing, invitations, public cases, roles, teams, and ownership transfer.
- Guest mode, password login, Google API integrations, and automated AI analysis.
- Merge import, automatic conflict merging, collaborative real-time editing, archive/status workflows, and historical version browsing.
- Full offline application startup, guaranteed offline map tiles, offline photo uploads, and offline create/delete/import.
- A redesign, a new design system, or a mobile-specific expansion.
- Automated migration/claiming of the old installation's anonymous case/photos. The user will import an existing JSON file.
- Cloud object storage, multiple application replicas, hosting purchase, public deployment, and backup scheduling services.
- Business upload/storage quotas, billing, or an administration panel. Technical archive-processing bounds still need to be documented and tested.

## Further Notes

- Proposed task granularity, blocking edges, and testing seams await review; task implementation requires a separate instruction.
- The existing MVP task records are historical and remain unchanged. The new task documents use exactly the seven sections requested by the user, including an unfilled delivery/review record until implementation evidence exists.
- Manual export is intended for later analysis in ChatGPT, without an application integration or a promise that arbitrary ZIP sizes/formats will be processed there.
- Primary references: [Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect), [Google PKCE library](https://github.com/googleapis/google-auth-library-nodejs/blob/main/src/auth/oauth2client.ts), [Google audience exceptions](https://support.google.com/cloud/answer/15549945?hl=en), [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), and PostGIS [point coordinate order](https://postgis.net/docs/ST_MakePoint.html) and [SRID semantics](https://postgis.net/docs/ST_SetSRID.html).
