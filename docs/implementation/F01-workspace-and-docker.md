# F01 — Nx workspace and local Docker runtime

Status: done
Depends on: none

## Goal

Create the runnable application foundation: one Nx workspace containing Angular and a NestJS Express API, with a local Linux Docker Compose runtime. Deliver a real browser shell and working API connection.

## Read first

- [Frontend architecture](../architecture/frontend.md), including library boundaries, editor ownership, and JSON/persistence flows.
- [Execution guide](README.md).
- [Current architecture](../mvp/issues/10-local-architecture.md), especially the refined implementation boundaries.
- [NestJS ADR](../adr/0001-use-nestjs-in-the-nx-workspace.md).
- [Accepted visual direction](../mvp/prototypes/pawtrace-floating-prototype.html), for the initial shell only; functional features follow later tasks.
- [Nx/NestJS feasibility](../mvp/research/nestjs-image-feasibility.md), for framework compatibility and dependency boundaries.

## Scope

1. Inspect the current repository and preserve its existing documentation and assets. Select mutually supported Nx, Angular, NestJS, and Node versions using current official documentation; pin the actual dependency set and package manager.
2. Create Angular and NestJS Express projects in the same workspace. Establish build/serve/check targets and clear browser/server dependency boundaries. Add shared libraries only where this slice actually needs them.
3. Connect the browser application to a small API health endpoint. Make frontend-to-API routing work in both the documented local-development path and the container runtime.
4. Add Dockerfile/build stages and Compose configuration so one documented command builds and starts the desktop application. Serve the built frontend and API coherently; preserve future asset-mount configuration without implementing uploads.
5. Add a configuration example, ignore local environment files, and document actual startup/shutdown commands in the root README. Create the basic green application shell using the approved visual direction.

## Acceptance criteria

- A fresh install from the lockfile builds the Angular application and NestJS API using supported versions.
- The documented Compose command starts the application and a browser can reach the shell and successful API health response.
- Browser and server configuration work without hardcoded machine paths or credentials.
- The root README explains prerequisites and the actual commands introduced by this task.
- Existing planning documents and the original icon remain intact. The task adds no case database, authentication, image processor, or mobile HTTPS setup.

## Validation

Run the workspace's relevant build and static checks. Start Compose, inspect the browser shell and API request, and restart the runtime once. Record the exact commands, versions, and results. This task requires no external map token.

## Architecture integration

Create frontend projects under `libs/web/**`, API-only projects under `libs/api/**`, and the neutral contract under `libs/shared/case-domain` as needed. Establish compatible Angular/Nx versions with stable Signal Forms and verify the public `linkedSignal` custom-setter declaration. Enforce dependency directions with Nx lint boundaries.

## Completion notes

Implemented and verified on 2026-10-26. The partially generated Angular project is now a usable Polish green shell based on the approved floating-panel direction. It requests same-origin `/api/health`, shows checking/online/offline states, and offers retry after failure. NestJS Express returns `{"status":"ok"}`; the production process also serves the compiled browser files. The original `assets/icon.svg` is used without modification.

Versions: Node 24.16.0, npm 11.13.0, Nx and all direct Nx plugins 24.0.1, Angular runtime/forms 22.2.3, Angular build/CLI 22.2.4, NestJS 11.2.8, TypeScript 6.0.3, RxJS 7.8.2, Webpack 5.112.2. Exact direct pins and npm lockfile are committed. Node/npm are recorded in package engines, packageManager and .node-version; Docker pins the same versions. Compatibility was checked against [Angular](https://angular.dev/reference/versions), [Nx](https://nx.dev/docs/kb/angular-nx-version-matrix), [NestJS](https://docs.nestjs.com/first-steps), and installed package peer declarations. Angular forms declarations expose the stable v22 API, and `node_modules/@angular/core/types/core.d.ts` contains both public `linkedSignal` overloads with `set?: (value, rawSet) => void`. Actual editor integration belongs to later tasks.

Projects are `apps/web`, `apps/api` and `apps/web-e2e`. Nx tags enforce web/API/shared dependency direction, with map-engine and browser-persistence constraints reserved for those future projects. No shared library is needed for this health-only slice. Docker has build, dependency and non-root runtime stages, a healthcheck, a loopback-bound configurable desktop port, and the future asset bind mount. Root README documents installation, development, production startup, logs, restart, shutdown and checks. Local environment and asset contents are ignored.

Validation completed:

- `npm run typecheck`, `npm run lint`, `npm run build`: passed (both applications; e2e configuration also typechecked/linted).
- `npx nx run web:test --run src/app/app.spec.ts --output-style=static`: passed after the initial health-request test failed against the generated shell. Two Angular tests cover successful connection and recovery after HTTP 503.
- `npx nx run api:test --run src/application.spec.ts --output-style=static`: passed after the initial red run; a real HTTP server returns status 200 and the health JSON.
- `npm test`: full unit/integration suite passed, 3 tests across 2 projects.
- `npx playwright install chromium`, then `npx nx run web-e2e:e2e --output-style=static`: passed against the development proxy, including the actual API response and original icon.
- `docker compose config --quiet`: passed.
- `docker compose up --build --wait`: clean Linux `npm ci` and both production builds passed; runtime became healthy. Initial verification was delayed by Docker Desktop being paused; it succeeded after Desktop resumed.
- With PowerShell `$env:BASE_URL='http://127.0.0.1:8080'`, `npx nx run web-e2e:e2e --output-style=static`: passed against the container; environment override removed afterwards. Collaborative browser inspection confirmed the shell, icon and health request (HTTP 200), without browser errors.
- `docker compose restart pawtrace`, `docker compose up --wait`, `docker compose ps`: healthy after restart. `Invoke-RestMethod http://127.0.0.1:8080/api/health` returned `{"status":"ok"}`. Runtime reports Node v24.16.0 and uid/gid 1000 (node).
- Two independent code-review axes (Standards and Spec) reported no findings against the initial repository HEAD `0d0720f` and staged F01 changes.

No database, authentication, image processing, uploads, real map integration, or mobile HTTPS was introduced. No map token is required. Existing planning assets remain intact; only completion tracking and startup documentation were updated.
