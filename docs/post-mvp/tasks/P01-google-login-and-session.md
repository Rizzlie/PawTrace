# P01 — Google login and durable private session

Status: planned; implementation not started.
Blocked by: none.

## Assumptions and sources

- The user selected Google authorization code + PKCE, seven days of inactivity measured by authenticated API requests, and an optional backend email allowlist. Empty means admit every authenticated Google account.
- Read the [release specification](../spec.md), especially Authentication and session, and the [execution/index rules](README.md). The [relational persistence decision](../../adr/0005-store-cases-relationally-in-postgresql-and-postgis.md) also applies to user/session records.
- Primary references: [Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect), [Google PKCE implementation](https://github.com/googleapis/google-auth-library-nodejs/blob/main/src/auth/oauth2client.ts), [audience exceptions](https://support.google.com/cloud/answer/15549945?hl=en), and [session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
- No provider credentials or public hosting are assumed. Existing Redis is an evictable address cache, not a durable session store.

## Scope

Deliver the complete login-to-private-shell path: a login screen, backend authorization redirect/callback, stable user identity, persistent application session, authenticated-user state in the browser, and explicit server logout. Include the PostgreSQL/PostGIS Compose service, initial user/session migrations, readiness and environment documentation needed to demonstrate that session across an application restart.

Use issuer/subject identity, validate state/nonce/PKCE and ID token claims, and enforce verified-email admission. Keep the secret and exchanged tokens server-side. Use an opaque cookie and a maintained server-session implementation with CSRF protection, expiry and safe rotation. Protect private application endpoints; ownerless legacy assets must not remain anonymously readable as a temporary shortcut. Later tasks add case-specific authorization and local queue cleanup, not the first authentication boundary.

Provide controlled-provider/time seams for deterministic tests without a login bypass in the production runtime. The browser shell identifies expired/denied/failed login separately and does not expose a previous account's local document while identity is unknown.

## Acceptance criteria

- [ ] Allowed Google sign-in returns to the application; denial/cancellation/provider failure produces a recoverable login state.
- [ ] Empty allowlist admits two distinct verified identities; populated allowlist rejects a valid but unlisted account. A user-supplied email or forged identity is insufficient.
- [ ] Invalid state, nonce, PKCE verifier, signature, issuer, audience, expired token and replayed callback fail without creating an authenticated session.
- [ ] Browser restart and application restart retain a valid session. Production cookie flags and CSRF checks are enforced; session credentials are absent from browser JavaScript storage and API bodies.
- [ ] At seven days of inactivity the session is rejected before being touched. A request just before expiry extends it; anonymous/invalid requests do not. Authenticated API traffic counts without a foreground interaction requirement.
- [ ] Identifier renewal tolerates concurrent tab requests. Logout revokes the session, and old cookies do not regain access after process restart.
- [ ] Anonymous access to private API and original/derivative asset routes is denied. Health/static bootstrap remains usable without extending a session.
- [ ] Compose starts from an empty database and applies migrations repeatably without erasing persisted users/sessions. Test identity support is unavailable in a production build/configuration.

## Verification steps

1. Run relevant Nx checks using the index's target discovery. Exercise the real HTTP application with PostgreSQL and a controlled signed OIDC provider/JWKS, not a mocked authenticated request object.
2. Test each failed callback/claim/admission case and assert both response behavior and absence of a usable session. Inspect cookie behavior and attempt CSRF on a mutating endpoint.
3. With an injected clock, test immediately before, at and after the seven-day boundary; test activity extension, background authenticated traffic, concurrent renewal and revoked-session replay.
4. In a real browser, sign in, reload, reopen its persistent profile, sign out and retry a saved private URL. Restart the API while retaining the database and repeat session validation.
5. Perform a minimal real-Google login/logout smoke check when credentials are available. Record this separately from deterministic tests; unavailable credentials leave that required external check visibly blocked.

## Discussion topics and decision record

- Settled: Google-only identity, PKCE S256, server-side session, sliding seven-day API inactivity, optional allowlist, no retained 30-day absolute cap.
- Implementation decision to record: maintained OIDC/session library, SQL access and migration tooling, user uniqueness, cookie/rotation details, and test-provider isolation. Select these before introducing dependent database conventions; no ORM is preselected.
- Record the exact authenticated API activity classification, development HTTP exception and production HTTPS behavior. Adding privileged Google scopes or a production auth bypass changes scope and requires review.

## Scope boundaries

Case catalogue/mapping belongs to P02; photo ownership to P03; account-keyed local queues and pending-edit logout to P04. This task provides server revocation and must not claim those later recovery flows are complete. Excludes passwords, guest mode, invitations, admin UI, Google data integrations, hosting purchase and public deployment. Keep an incomplete integration private until P10 acceptance.

## Delivery and review record

- Implementation: not started; implementer/date/branch/commit/PR not recorded yet.
- Verification: not run for this task; add exact commands, results, clock/provider setup and live-Google evidence.
- Standards review: pending; record reviewer, findings and resolution.
- Specification review: pending; map evidence to the criteria above, including denied access and expiry.
- Remaining blockers/limitations: live credentials/configuration may block the external smoke check; do not mark done while a required check remains unverified.
