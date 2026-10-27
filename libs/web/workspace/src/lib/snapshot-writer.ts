import type { CaseDocument } from "@pawtrace/case-domain";
import type { SnapshotStorage } from "@pawtrace/browser-persistence";

export interface SnapshotJob {
  document: CaseDocument;
  revision: number;
  generation: number;
}

/** Serializes autosaves and replacement through the same transaction boundary. */
export class SnapshotWriter {
  private pending?: SnapshotJob;
  private active?: Promise<void>;
  private replacing = false;

  constructor(
    private readonly storage: SnapshotStorage,
    private readonly started: () => void,
    private readonly saved: (job: SnapshotJob) => void,
    private readonly failed: () => void,
  ) {}

  request(job: SnapshotJob): void {
    if (this.replacing) return;
    this.pending = job;
    if (!this.active) this.start();
  }

  private start(): void {
    const job = this.pending;
    if (!job || this.replacing) return;
    this.pending = undefined;
    this.started();
    this.active = this.write(job);
  }

  private async write(job: SnapshotJob): Promise<void> {
    // Yield once so even a synchronous adapter failure follows active assignment.
    await Promise.resolve();
    let succeeded = false;
    try {
      await this.storage.write(job.document);
      this.saved(job);
      succeeded = true;
    } catch {
      this.pending ??= job;
      this.failed();
    } finally {
      this.active = undefined;
      if (succeeded) this.start();
    }
  }

  async replace(document: CaseDocument): Promise<void> {
    if (this.replacing) throw new Error("Replacement already in progress");
    this.replacing = true;
    this.pending = undefined;
    try {
      await this.active;
      // A failed in-flight job may have requeued itself; it must never follow import.
      this.pending = undefined;
      await this.storage.write(document);
    } finally {
      this.replacing = false;
    }
  }
}
