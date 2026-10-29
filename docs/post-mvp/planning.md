# PawTrace after MVP

Status: product scope, [specification](spec.md), [task breakdown](tasks/README.md), blocking edges and testing seams accepted by the user. The user selected repository documents as the tracker. Application implementation has not started and requires a separate task instruction.

## Confirmed boundaries

- Run one shared application instance accessible over the internet.
- Add Google sign-in and database-backed case storage so users can select and reopen their cases.
- Google sign-in is required for creating and opening cases; there is no guest mode.
- Enforce an optional Google email allowlist in the backend configuration using the verified Google email. A nonempty list restricts admission to its addresses; an empty list admits any successfully authenticated Google account. The Google Console test-user list is not the application's admission control.
- Use PostgreSQL with PostGIS and relational case data, not a JSON/JSONB case document as the primary database representation. Map between relational data and the JSON contract during import/export.
- Keep photo binaries in a persistent Docker-mounted directory, with database records linking them to their case and owner. Authorize original, thumbnail, and preview access. Full-instance backups cover both the database and photo directory.
- Use Google OAuth authorization code with PKCE and a server-side application session with an HttpOnly cookie, preserving login while the application session remains active. Google API refresh tokens are not required solely to maintain that session. Detailed session implementation is specified in the release plan and completed by the login task.
- Persistent login expires after seven days of inactivity, requiring Google sign-in again. This replaces the earlier 30-day proposal. Activity means authenticated API endpoint use, as explicitly selected by the user; do not substitute a foreground-interaction-only definition. Automated authenticated API traffic can therefore keep the session active. Session expiry preserves pending local changes; synchronization requires the same account to authenticate again.
- Each case has one owner and is private to that owner in the first release. Shared editing is outside this release.
- Save changes automatically. On connection loss, persist changes in IndexedDB and synchronize them to the database when the connection returns.
- If another tab or device changes the server version before local changes synchronize, ask the user to choose the local or server version. Show save times and allow export of the local copy before choosing; do not silently overwrite either version.
- If the server case has been deleted while a device has pending local edits, inform the user and offer local data export or saving as a new case when online. Never silently recreate the deleted case.
- Offline editing covers case data and map objects; adding new photos requires a connection. Offline basemap availability depends on previously downloaded tiles, without a guaranteed offline map feature.
- Export a case as a ZIP containing JSON and its photos. The export is intended to support later analysis.
- Include the complete JSON and original photo files in the ZIP. The intended analysis workflow is a manual upload to ChatGPT; no analysis integration is requested. Whether a particular upload can be processed by ChatGPT has not been validated.
- Import ZIP or standalone JSON by replacing case contents. Merge is explicitly excluded to avoid unnecessary complexity. Preserve the open case's identity and owner; replace its contents only after confirmation, offering an export first. With no open case, import creates a new case. Invalid input leaves the current case unchanged.
- Retain standalone JSON import, with a warning about missing photo files. ZIP is the complete case transfer format.
- Existing data will be brought into the completed application using the user's existing JSON file. A separate migration of the old installation and its photo directory is not required.
- Creating, deleting, and importing cases require a connection in this release. Offline work is limited to editing a previously loaded case in an already running application; launching the application from scratch offline is not guaranteed. Local pending changes persist in IndexedDB across interruption.
- Explicit logout removes local case copies from the device. Warn about pending changes first and allow cancellation or export before the user confirms logout.
- Provide a My cases list with creation, opening, renaming, and deletion. Confirm deletion; omit statuses and archiving in this release. Keep local pending changes separately per case so switching cases does not lose them.
- Limit design work to light visual polish, including spacing. A redesign or mobile-specific expansion has not been requested.
- Continue using Docker Compose for the shared deployment. No hosting/server has been selected; hosting selection and public deployment are deferred.

## Existing behavior relevant to the change

- IndexedDB holds one current case per browser profile and origin.
- JSON import replaces the current case; export contains committed case data.
- Photo files live on the server and are referenced by the case document; the current JSON export does not contain the files.
- The API does not currently authenticate users or restrict photo access by case ownership.

## Implementation planning details

- Define the relational schema, spatial column mapping, migrations, and atomic case replacement that preserves the JSON contract and case ownership.
- Specify the server-session implementation, authenticated API activity handling, cookie/CSRF protection, and expiry and logout behavior across tabs.
- Specify optimistic concurrency, per-owner/per-case local storage, synchronization recovery, and stale/deleted-case handling.
- Specify validated ZIP import/export, photo ownership and file lifecycle, and existing JSON compatibility.
- Select concrete spacing adjustments in the existing interface without redesigning its layout.
- Keep hosting selection and public deployment deferred. No merge mode, guest mode, shared editing, full offline startup, or offline creation/deletion/import is included.

The user requires every task to include Assumptions and sources; Scope; Acceptance criteria; Verification steps; Discussion topics and decision record; Scope boundaries; Delivery and review record. After reviewing the ten-task breakdown and testing approach, the user explicitly accepted them. Application code has not been changed.

## Authentication reference findings

- [Google audience settings](https://support.google.com/cloud/answer/15549945?hl=en): basic `openid`, email, and profile scopes are exempt from the test-user-list requirement and seven-day testing authorization expiry. Do not rely on that list alone as the application's admission control.
- [Google Node authentication library](https://github.com/googleapis/google-auth-library-nodejs/blob/main/src/auth/oauth2client.ts): supports PKCE verifier/challenge generation with S256.
- [Google server OAuth flow](https://developers.google.com/identity/protocols/oauth2/web-server): Google refresh tokens renew access to Google APIs; local application-session renewal is a separate design choice.
