# F01 — Nx workspace and local Docker runtime

Status: planned
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

To be filled during implementation.
