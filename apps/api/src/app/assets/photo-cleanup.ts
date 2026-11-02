import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { PhotoRepository } from '../../cases/photo-repository';
import { OriginalAssets } from './original-assets';
import type { StorageId } from './storage-id';

/**
 * Removes only what PostgreSQL names. Published directories are never compared with the database:
 * a restored or empty database must not read as permission to erase every original.
 */
@Injectable()
export class PhotoCleanup implements OnApplicationBootstrap {
  private readonly logger = new Logger(PhotoCleanup.name);

  constructor(
    @Inject(OriginalAssets) private readonly originals: OriginalAssets,
    @Inject(PhotoRepository) private readonly photos: PhotoRepository,
  ) {}

  /** Runs before the application listens, so no upload of this single instance is in flight. */
  async onApplicationBootstrap(): Promise<void> {
    await this.originals.clearStaging();
    await this.removeDeleted();
  }

  /** A file published after its case was deleted joins the queue that deletion already drained. */
  async removeOrphan(storageId: StorageId): Promise<void> {
    await this.photos.queueRemoval(storageId);
    await this.removeDeleted();
  }

  /** Called once a case deletion commits; what fails here stays queued for the next attempt. */
  async removeDeleted(): Promise<void> {
    try {
      for (const storageId of await this.photos.pendingRemovals()) {
        await this.originals.remove(storageId);
        await this.photos.removalFinished(storageId);
      }
    } catch {
      this.logger.warn('Deleted case photos remain queued for removal.');
    }
  }
}
