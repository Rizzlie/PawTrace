# Persistent local PostgreSQL and Redis

Use this standalone stack for everyday local data while running the application with Node. It uses the same PostgreSQL 17/PostGIS 3.5 and Redis 7.4.6 images as `compose.yaml`, with password authentication, health checks, automatic restart, bounded container logs and dedicated named volumes. PostgreSQL listens on `127.0.0.1:5432`; Redis on `127.0.0.1:6380`. The disposable authentication tests use different ports (`55432` and `6379`) and a separate Compose project.

## First start

From the repository root, with Docker Desktop running Linux containers:

```sh
npm run dev
```

`npm run dev` starts PostgreSQL and Redis, waits for both health checks, then starts web and API through Nx. The initializer creates the ignored `.env.local-data` with independent random passwords and connection URLs. Running it again preserves the file. It never edits `.env`. Keep the credential file while using these volumes: changing `POSTGRES_PASSWORD` after database initialization does not change the database role's password.

`npm run dev:apps` loads `.env.local-data` into the application processes, so you do not need to copy connection URLs into `.env`. These values take precedence over `.env`; explicitly exported shell variables still take precedence over both files. Keep your Google credentials, session secret and public origin in `.env`; setting `DATABASE_URL` enables authentication and requires those settings. The API applies its committed database migrations before becoming ready. The database initially contains no users or cases; this setup does not import another instance's data.

Ctrl+C stops the web/API processes. PostgreSQL and Redis continue running in Docker; use `npm run data:down` to stop them while preserving data. Use `npm run dev:apps` to start just web and API when infrastructure is already running, or `npm run data:up` for infrastructure alone.

If a port is occupied, change `POSTGRES_PORT` or `REDIS_PORT` in `.env.local-data` and update the corresponding connection URL there before starting. Use this file on its own, without merging it with `compose.yaml` or `compose.auth-test.yaml`. The full application container in `compose.yaml` continues to use its own database and Redis.

## Everyday commands

```sh
# Status and logs
npm run data:status
npm run data:logs

# Stop and remove containers, retaining data
npm run data:down

# Start again using the same data
npm run data:up
```

The volumes are `pawtrace-local-data_postgres-data` and `pawtrace-local-data_redis-data`. Container recreation retains them. `down --volumes` deletes them, so do not use it for routine shutdown.

Redis uses the application's cache policy (`64mb`, `allkeys-lru`) and AOF with `appendfsync everysec`. Cache entries can expire or be evicted normally; the last second of writes can be lost on a crash. PostgreSQL stores cases and sessions; Redis is a cache, not the source of record. See [Redis persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/) and [Compose services](https://docs.docker.com/reference/compose-file/services/).

## Backup

Create a PostgreSQL custom-format dump inside the container, then copy it to the host. This avoids binary shell redirection on Windows:

```sh
docker compose --env-file .env.local-data -f compose.local-data.yaml exec -T postgres pg_dump -U pawtrace -d pawtrace -Fc -f /tmp/pawtrace.dump
docker compose --env-file .env.local-data -f compose.local-data.yaml cp postgres:/tmp/pawtrace.dump ./pawtrace-local.dump
```

Move the dump to your private backup location. Back up the application's complete `ASSET_DIRECTORY` alongside PostgreSQL while uploads are stopped; the database dump does not contain photo files. Keep `.env.local-data` privately with the backup. Redis cache data can be rebuilt.

This is a persistent local single-instance setup. It does not provide remote TLS access, replication or automatic backups.
