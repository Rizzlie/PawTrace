import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { join } from 'node:path';
import * as schema from './schema';

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
    throw new Error('Authentication database startup failed');
  }
}
