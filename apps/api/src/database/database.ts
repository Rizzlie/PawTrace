import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { join } from 'node:path';
import type { OnApplicationShutdown } from '@nestjs/common';
import * as authSchema from '../auth/schema';
import * as caseSchema from '../cases/schema';

const schema = { ...authSchema, ...caseSchema };
export type Database = NodePgDatabase<typeof schema>;

/** Drizzle applies committed migrations before Nest becomes ready. */
export async function openDatabase(connectionString: string) {
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 5000 });
  try {
    const client = await pool.connect();
    try {
      // The migration runner owns its transaction; the session lock serializes startup.
      await client.query('SELECT pg_advisory_lock(702001)');
      await migrate(drizzle(client), { migrationsFolder: join(__dirname, 'migrations') });
    } finally {
      try {
        await client.query('SELECT pg_advisory_unlock(702001)');
      } finally {
        client.release();
      }
    }
    return { db: drizzle(pool, { schema }), close: () => pool.end() };
  } catch {
    await pool.end();
    throw new Error('Database startup failed');
  }
}

export type DatabaseHandle = Awaited<ReturnType<typeof openDatabase>>;

/** One migrated pool per application, shared by authentication and case persistence. */
export class DatabaseConnection implements OnApplicationShutdown {
  private closed = false;
  private constructor(readonly handle: DatabaseHandle | undefined) {}

  static async open(connectionString: string) {
    return new DatabaseConnection(
      connectionString ? await openDatabase(connectionString) : undefined,
    );
  }

  async onApplicationShutdown() {
    if (!this.closed) {
      this.closed = true;
      await this.handle?.close();
    }
  }
}
