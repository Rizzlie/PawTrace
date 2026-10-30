import { createHash, randomUUID } from 'node:crypto';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { CaseDocument } from '@pawtrace/case-domain';
import type { Database } from '../database/database';
import { fromCaseRows, toCaseRows, type CaseRows, type StoredCaseRows } from './case-mapping';
import * as tables from './schema';

export type Acknowledgement = { id: string; version: number | null; savedAt: string | null };
export type MutationOutcome =
  | { kind: 'ok'; ack: Acknowledgement }
  | { kind: 'not_found' }
  | { kind: 'version_conflict'; version: number }
  | { kind: 'key_reused' };
export type Mutation = {
  ownerId: string;
  key: string;
  operation: 'create' | 'save' | 'rename' | 'delete';
  caseId: string;
  /** Everything the client sent that identifies the operation; a replay must match exactly. */
  request: unknown;
};
type AnyCaseTable = typeof tables.caseRecords;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

class Rejected extends Error {
  constructor(readonly outcome: Exclude<MutationOutcome, { kind: 'ok' }>) {
    super(outcome.kind);
  }
}

/** Insertion order follows the foreign keys of the relational mapping. */
const insertionOrder: { [K in keyof CaseRows]: (typeof tables)[keyof typeof tables] } = {
  records: tables.caseRecords,
  eventTimes: tables.eventTimes,
  points: tables.points,
  pointRoles: tables.pointRoles,
  historyEntries: tables.historyEntries,
  observationDetails: tables.observationDetails,
  actionDetails: tables.actionDetails,
  pointCheckDetails: tables.pointCheckDetails,
  searchAreas: tables.searchAreas,
  areaChecks: tables.areaChecks,
  photoReferences: tables.photoReferences,
  caseEscapes: tables.caseEscapes,
  animalProfiles: tables.animalProfiles,
  photoCaptions: tables.photoCaptions,
  photoAssets: tables.photoAssets,
};

/**
 * Rows holding non-cascading references (observation links, escape point, main photo) go
 * first; removing the case-scoped identifier namespace then cascades to every other row.
 */
const deletionOrder = [
  tables.photoAssets,
  tables.pointCheckDetails,
  tables.areaChecks,
  tables.caseEscapes,
  tables.animalProfiles,
  tables.caseRecords,
] as unknown as AnyCaseTable[];

/** Owner-scoped relational case persistence with version checks and an idempotency ledger. */
export class CaseRepository {
  constructor(private readonly database: Database | undefined) {}

  /** Without a database the global guard denies private requests before reaching here. */
  private get db(): Database {
    if (!this.database) throw new Error('Case database is not configured');
    return this.database;
  }

  list(ownerId: string) {
    return this.db
      .select({
        id: tables.ownedCases.id,
        title: tables.ownedCases.title,
        version: tables.ownedCases.version,
        savedAt: tables.ownedCases.savedAt,
      })
      .from(tables.ownedCases)
      .where(eq(tables.ownedCases.ownerId, ownerId))
      .orderBy(desc(tables.ownedCases.savedAt), asc(tables.ownedCases.id))
      .then((rows) => rows.map((row) => ({ ...row, savedAt: row.savedAt.toISOString() })));
  }

  /** One repeatable-read snapshot, so a concurrent replacement cannot interleave rows. */
  read(ownerId: string, caseId: string) {
    return this.db.transaction(
      async (tx) => {
        const [scalars] = await tx
          .select()
          .from(tables.ownedCases)
          .where(and(eq(tables.ownedCases.id, caseId), eq(tables.ownedCases.ownerId, ownerId)));
        if (!scalars) return undefined;
        // One pooled client runs these sequentially inside the snapshot.
        const rows: Record<string, unknown[]> = {};
        for (const [name, table] of Object.entries(insertionOrder) as [string, AnyCaseTable][])
          rows[name] = await tx.select().from(table).where(eq(table.caseId, caseId));
        return {
          document: fromCaseRows({ ...rows, scalars } as StoredCaseRows),
          version: scalars.version,
          savedAt: scalars.savedAt.toISOString(),
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  create(mutation: Mutation, document: CaseDocument) {
    return this.mutate(mutation, async (tx, savedAt) => {
      const { scalars, rows } = toCaseRows(document);
      await tx
        .insert(tables.ownedCases)
        .values({ ...scalars, ownerId: mutation.ownerId, version: 1, savedAt });
      await insertRows(tx, rows);
      return 1;
    });
  }

  save(mutation: Mutation, baseVersion: number, document: CaseDocument) {
    return this.mutate(mutation, async (tx, savedAt) => {
      const version = await this.lock(tx, mutation, baseVersion);
      const { scalars, rows } = toCaseRows(document);
      await deleteDocumentRows(tx, mutation.caseId);
      await tx
        .update(tables.ownedCases)
        .set({ ...scalars, version: version + 1, savedAt })
        .where(eq(tables.ownedCases.id, mutation.caseId));
      await insertRows(tx, rows);
      return version + 1;
    });
  }

  rename(mutation: Mutation, baseVersion: number, title: string) {
    return this.mutate(mutation, async (tx, savedAt) => {
      const version = await this.lock(tx, mutation, baseVersion);
      await tx
        .update(tables.ownedCases)
        .set({ title, updatedAt: savedAt.toISOString(), version: version + 1, savedAt })
        .where(eq(tables.ownedCases.id, mutation.caseId));
      return version + 1;
    });
  }

  delete(mutation: Mutation, baseVersion: number) {
    return this.mutate(mutation, async (tx) => {
      await this.lock(tx, mutation, baseVersion);
      await deleteDocumentRows(tx, mutation.caseId);
      await tx.delete(tables.ownedCases).where(eq(tables.ownedCases.id, mutation.caseId));
      return null;
    });
  }

  static newCaseId() {
    return randomUUID();
  }

  /** Row lock serializes writers; the version is rechecked inside the committing transaction. */
  private async lock(tx: Transaction, mutation: Mutation, baseVersion: number) {
    const [current] = await tx
      .select({ version: tables.ownedCases.version })
      .from(tables.ownedCases)
      .where(
        and(
          eq(tables.ownedCases.id, mutation.caseId),
          eq(tables.ownedCases.ownerId, mutation.ownerId),
        ),
      )
      .for('update');
    if (!current) throw new Rejected({ kind: 'not_found' });
    if (current.version !== baseVersion)
      throw new Rejected({ kind: 'version_conflict', version: current.version });
    return current.version;
  }

  /**
   * Applies a mutation and records its key in the same transaction. A retried key returns the
   * committed acknowledgement instead of applying the mutation again.
   */
  private async mutate(
    mutation: Mutation,
    work: (tx: Transaction, savedAt: Date) => Promise<number | null>,
  ): Promise<MutationOutcome> {
    const fingerprint = createHash('sha256')
      .update(JSON.stringify([mutation.operation, mutation.request]))
      .digest('base64url');
    const replay = async (): Promise<MutationOutcome | undefined> => {
      const [previous] = await this.db
        .select()
        .from(tables.caseMutations)
        .where(
          and(
            eq(tables.caseMutations.ownerId, mutation.ownerId),
            eq(tables.caseMutations.idempotencyKey, mutation.key),
          ),
        );
      if (!previous) return undefined;
      if (previous.fingerprint !== fingerprint) return { kind: 'key_reused' };
      return {
        kind: 'ok',
        ack: {
          id: previous.caseId,
          version: previous.resultVersion,
          savedAt: previous.savedAt?.toISOString() ?? null,
        },
      };
    };
    const replayed = await replay();
    if (replayed) return replayed;
    try {
      return await this.db.transaction(async (tx) => {
        const savedAt = new Date();
        const version = await work(tx, savedAt);
        await tx.insert(tables.caseMutations).values({
          ownerId: mutation.ownerId,
          idempotencyKey: mutation.key,
          fingerprint,
          operation: mutation.operation,
          caseId: mutation.caseId,
          resultVersion: version,
          savedAt: version === null ? null : savedAt,
        });
        return {
          kind: 'ok' as const,
          ack: {
            id: mutation.caseId,
            version,
            savedAt: version === null ? null : savedAt.toISOString(),
          },
        };
      });
    } catch (error) {
      // A concurrent duplicate may have committed first: its acknowledgement wins.
      const committed = await replay();
      if (committed) return committed;
      if (error instanceof Rejected) return error.outcome;
      throw error;
    }
  }
}

/** Save and delete share this order: PostgreSQL checks references between cascade steps. */
async function deleteDocumentRows(tx: Transaction, caseId: string) {
  for (const table of deletionOrder) await tx.delete(table).where(eq(table.caseId, caseId));
}

async function insertRows(tx: Transaction, rows: CaseRows) {
  for (const [name, table] of Object.entries(insertionOrder) as [keyof CaseRows, never][]) {
    if (rows[name].length) await tx.insert(table).values(rows[name] as never);
  }
}
