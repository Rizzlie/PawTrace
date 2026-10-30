# P01 — Google login and durable private session

Status: done — the user confirmed a successful live Google login on 2026-10-30; the separate production-like HTTPS Compose smoke belongs to P10 acceptance.
Blocked by: live Google client/HTTPS configuration for the required external smoke check. No credentials requested or inspected.

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
- Implemented choices: `openid-client` 6.8.8 with explicit JWKS signature checking, `express-session` 1.19.0 with a transactional PostgreSQL family/identifier adapter, user-selected `drizzle-orm` 0.45.4 / `drizzle-kit` 0.31.11 over `pg` 8.23.1, generated SQL migrations under an advisory lock. Users are unique by issuer/subject; email is verified admission data. Nest AuthModule owns the controller, global guard, session middleware and provider lifecycle.
- [Runtime and decision record](../p01-authentication.md) documents the small installation interface, expiry/rotation/revocation, exact API activity classification, loopback HTTP exception, production HTTPS/cookie/proxy contract, test-provider isolation and limitations. Identity scopes remain `openid email`; production rejects controlled dependencies.

## Scope boundaries

Case catalogue/mapping belongs to P02; photo ownership to P03; account-keyed local queues and pending-edit logout to P04. This task provides server revocation and must not claim those later recovery flows are complete. Excludes passwords, guest mode, invitations, admin UI, Google data integrations, hosting purchase and public deployment. Keep an incomplete integration private until P10 acceptance.

## Delivery and review record

- Implementation: Codex implementation sub-agent, 2026-10-29, branch `google-session`, prepared worktree `C:/Users/macsy/.t3/worktrees/pawtrace/t3-f48620ed`. Confirmed clean HEAD, parent `feat/p01-google-session` and `origin/main` all started at `14a6b1bed8e991ccf19fb40c4ab2fc72ff02b42a`. Parent tip merge check: `git merge --ff-only feat/p01-google-session` reported already up to date. Implementation commit `93ccb2b337dd025d81590f6482949e9d15641b57` (`feat(auth): add Google login and durable Drizzle sessions`); normal pre-commit formatting and all 14 affected typecheck/test tasks passed (2 cached), and commitlint passed; no push or PR, per parent instruction.
- Verification: real PostGIS 17/3.5 and Redis started with `docker compose -p pawtrace-p01-test -f compose.auth-test.yaml up -d --wait`. First PostgreSQL start was empty; API restart repeats migration initialization without erasing identity/session data. Tests use a local RSA-signed OIDC provider/JWKS/token endpoint, real HTTP and injected application time, never authenticated request mocks. Nx authentication tests have caching disabled.
- Commands/evidence: `npm exec nx run api:test -- src/authentication.spec.ts --output-style=static` proved rejection of state/nonce/PKCE/signature/issuer/audience/expiry/replay, cancellation/provider failure, verified-email admission, two identities, HTTPS host-only cookie flags, CSRF, exact seven-day expiry, background activity beyond 30 days, concurrent rotation and racing logout with durable replay rejection. `npm exec nx run-many -- -t typecheck lint test build -p api web web-e2e --output-style=static` passed after the Drizzle/Nest adaptation: typecheck/lint for api, web and web-e2e; 81 API tests (including 21 authentication scenarios); 2 web tests; API and production web builds. `npm exec nx run api:db-generate -- --output-style=static` reported no schema changes. `npm exec nx run web-e2e:e2e -- --workers=2 --output-style=static` passed 81 scenarios, with exactly 3 explicit P03 ownership fixmes. Normal commit-hook evidence is recorded with the implementation commit above. The signed-provider PKCE rejection test alters the authorization challenge and verifies an actual S256 mismatch. Browser evidence includes actual signed redirects, reload, persistent-profile reopen, API restart, logout and expired/denied/failed/cancelled states. No live Google test was performed.
- Standards review: independent Standards reviewer on 2026-10-29 reviewed `git diff 14a6b1b...8812243`; no hard standard violations or material smells. One low-priority finding in `apps/web/src/app/session.ts` exposed writable logout signals; parent resolved it with private writable handles and public readonly projections. Resolved findings from execution: cookie renewal on rejected requests, rotation response identity, SPA fallback beneath hidden checkout paths, onboarding fixture assumptions, account controls outside the existing header, and mobile map height after adding account UI (resolved by placing it in the existing brand menu). User-requested Drizzle and native NestJS integration supersede the initial direct-SQL/Express-router draft. No sub-agents used.
- Specification review: deterministic HTTP/browser coverage maps to all listed criteria except live Google/Console validation and production-like externally configured HTTPS Compose smoke. Independent Spec reviewer on 2026-10-29 found zero implementation findings and no scope creep; confirmed the external evidence blocker. Acceptance boxes remain unchecked until required external verification and review finish.
- Parent verification: after integration and the readonly-signal correction, `CI=true NX_DAEMON=false npm exec nx run-many -- -t typecheck lint test build -p api web web-e2e --output-style=static` passed all 10 targets without cache hits: 81 API and 2 web tests; typecheck/lint/build succeeded. Existing bundle-budget and conditional-test warnings remain. `CI=true NX_DAEMON=false npm exec nx run web-e2e:e2e -- src/authentication.spec.ts --workers=1 --output-style=static` then passed both signed-provider browser scenarios (real browser test execution; only build dependencies cached), including persistent-profile reopen, API restart and revoked-cookie rejection.
- Integration: fast-forwarded into `feat/p01-google-session`; [PR #20](https://github.com/Rizzlie/PawTrace/pull/20) targets `main` and remains open for review. No local merge into main or hook bypass.
- User live-Google confirmation: on 2026-10-30 the user reported a successful live Google login. This is the user's own confirmation, not an implementer-run check.
- Remaining blockers/limitations (as recorded before that confirmation): live Google credentials/Console/HTTPS smoke unavailable; P01 is **not done**. P02–P04 are unimplemented; ownerless uploads and every legacy asset route are denied even after login, and account-keyed local queues/pending-edit logout are not claimed. Three historical browser photo-publication scenarios are explicitly `fixme` pending P03 ownership; adapter storage regression coverage and current upload-denial tests remain active. Session tombstones have no pruning job. Production web build emits the existing 500 kB warning budget (under the 1 MB error budget); browser lint reports the pre-existing conditional-test warning in filters.
