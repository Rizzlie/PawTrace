import { and, eq } from 'drizzle-orm';
import type { Database } from '../database/database';
import { ownedCases, photoRemovals, storedPhotos } from './schema';

export type StoredPhoto = { storageId: string; filename: string };

/** The owner → case → stored photo relation. Every file access starts from a row found here. */
export class PhotoRepository {
  constructor(private readonly database: Database | undefined) {}

  /** Without a database the global guard denies private requests before reaching here. */
  private get db(): Database {
    if (!this.database) throw new Error('Case database is not configured');
    return this.database;
  }

  async ownsCase(ownerId: string, caseId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: ownedCases.id })
      .from(ownedCases)
      .where(and(eq(ownedCases.id, caseId), eq(ownedCases.ownerId, ownerId)));
    return rows.length > 0;
  }

  /** Both the owner and the case bound the lookup: a filename means nothing on its own. */
  async find(ownerId: string, caseId: string, filename: string): Promise<StoredPhoto | undefined> {
    const [photo] = await this.db
      .select({ storageId: storedPhotos.storageId, filename: storedPhotos.filename })
      .from(storedPhotos)
      .innerJoin(ownedCases, eq(ownedCases.id, storedPhotos.caseId))
      .where(
        and(
          eq(storedPhotos.caseId, caseId),
          eq(storedPhotos.filename, filename),
          eq(ownedCases.ownerId, ownerId),
        ),
      );
    return photo;
  }

  /** False when the case is no longer the owner's. The case row lock excludes a racing delete. */
  register(ownerId: string, caseId: string, photo: StoredPhoto): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [owned] = await tx
        .select({ id: ownedCases.id })
        .from(ownedCases)
        .where(and(eq(ownedCases.id, caseId), eq(ownedCases.ownerId, ownerId)))
        .for('share');
      if (!owned) return false;
      await tx.insert(storedPhotos).values({ ...photo, caseId });
      return true;
    });
  }

  async isRegistered(storageId: string): Promise<boolean> {
    const rows = await this.db
      .select({ storageId: storedPhotos.storageId })
      .from(storedPhotos)
      .where(eq(storedPhotos.storageId, storageId));
    return rows.length > 0;
  }

  async forget(storageId: string): Promise<void> {
    await this.db.delete(storedPhotos).where(eq(storedPhotos.storageId, storageId));
  }

  async pendingRemovals(): Promise<string[]> {
    if (!this.database) return [];
    const rows = await this.db.select({ storageId: photoRemovals.storageId }).from(photoRemovals);
    return rows.map((row) => row.storageId);
  }

  async removalFinished(storageId: string): Promise<void> {
    await this.db.delete(photoRemovals).where(eq(photoRemovals.storageId, storageId));
  }
}
