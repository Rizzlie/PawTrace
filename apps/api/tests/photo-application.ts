import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Pool } from 'pg';
import { createApplication } from '../src/application';
import { ApiClient } from './case-client';
import { startProvider } from './oidc-provider';

export const DATABASE_URL =
  'postgres://pawtrace_test:local-test-only@127.0.0.1:55432/pawtrace_test';

/** The real application over PostGIS and a real temporary asset directory, with signed logins. */
export async function startPhotoApplication(prefix: string) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  vi.stubEnv('DATABASE_URL', DATABASE_URL);
  vi.stubEnv('SESSION_SECRET', 'test-session-secret-at-least-32-characters');
  vi.stubEnv('GOOGLE_CLIENT_ID', 'test-client');
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-secret');
  vi.stubEnv('AUTH_EMAIL_ALLOWLIST', '');
  vi.stubEnv('ASSET_DIRECTORY', directory);
  const provider = await startProvider();
  const run = randomUUID().slice(0, 8);
  const harness = {
    directory,
    base: '',
    app: undefined as NestExpressApplication | undefined,
    // A restart keeps the port, so signed-in clients survive it as browsers would.
    async start() {
      harness.app = await createApplication({
        ignoreEnvFile: true,
        authentication: { provider: provider.configuration },
      });
      await harness.app.listen(harness.base ? new URL(harness.base).port : 0, '127.0.0.1');
      harness.base = await harness.app.getUrl();
    },
    async restart() {
      await harness.app?.close();
      await harness.start();
    },
    signIn: (name: string) => ApiClient.signIn(harness.base, provider, `${name}-${run}`),
    /** A signed-in owner with one open case, the usual starting point of a photo scenario. */
    async owner(name: string) {
      const client = await harness.signIn(name);
      const created = await client.create('Sprawa ' + name);
      return { client, caseId: created.body.id as string };
    },
    async stop() {
      await harness.app?.close();
      await provider.close();
      vi.unstubAllEnvs();
      await rm(directory, { recursive: true, force: true });
    },
  };
  await harness.start();
  return harness;
}

/** Fault injection and setup that have no HTTP surface. Assertions stay on HTTP. */
export async function withDatabase<T>(work: (pool: Pool) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    return await work(pool);
  } finally {
    await pool.end();
  }
}
