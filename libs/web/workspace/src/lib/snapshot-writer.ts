import type { CaseDocument } from '@pawtrace/case-domain';

/** A captured save: local bookkeeping plus the server request it becomes. */
export interface SnapshotJob {
  document: CaseDocument;
  revision: number;
  generation: number;
  version: number;
  key: string;
}
export interface SnapshotAcknowledgement {
  version: number;
}
type WriteJob = (job: SnapshotJob) => Promise<SnapshotAcknowledgement>;

/** Serializes autosaves and replacement through the same storage acknowledgement boundary. */
export class SnapshotWriter {
  private pending?: SnapshotJob;
  private active?: Promise<void>;
  private replacing = false;

  constructor(
    private readonly storage: { write: WriteJob },
    private readonly started: (job: SnapshotJob) => void,
    private readonly saved: (job: SnapshotJob, acknowledgement: SnapshotAcknowledgement) => void,
    private readonly failed: (job: SnapshotJob, error: unknown) => void,
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
    this.started(job);
    this.active = this.write(job);
  }

  private async write(job: SnapshotJob): Promise<void> {
    // Yield once so even a synchronous adapter failure follows active assignment.
    await Promise.resolve();
    let succeeded = false;
    try {
      this.saved(job, await this.storage.write(job));
      succeeded = true;
    } catch (error) {
      this.pending ??= job;
      this.failed(job, error);
    } finally {
      this.active = undefined;
      if (succeeded) this.start();
    }
  }

  /** Drains the writer, then lets `run` perform its writes behind the replacement barrier. */
  async replace<T>(run: (write: WriteJob) => Promise<T>): Promise<T> {
    if (this.replacing) throw new Error('Replacement already in progress');
    this.replacing = true;
    this.pending = undefined;
    try {
      await this.active;
      // A failed in-flight job may have requeued itself; it must never follow import.
      this.pending = undefined;
      return await run((job) => this.storage.write(job));
    } finally {
      this.replacing = false;
    }
  }
}
