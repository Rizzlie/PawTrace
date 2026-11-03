import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { CaseDocument } from '@pawtrace/case-domain';
import { CaseApi, isVersionConflict, VersionConflict } from './case-api';

export interface StoredCase {
  document: unknown;
  version: number;
  revision?: number;
  savedRevision?: number;
  paused?: boolean;
  localError?: string;
}
/** One save: the captured document, the version it is based on and its idempotency key. */
export interface SaveRequest {
  replacement?: boolean;
  document: CaseDocument;
  version: number;
  key: string;
}

/**
 * Snapshot persistence seam of the workspace store. The active revision/version belong to
 * `CaseState.persistence`; a durable adapter also retains their recoverable storage metadata.
 */
export abstract class CaseStorage {
  checkpoint?(document: CaseDocument, revision: number, version: number): Promise<void>;
  retryPending?(except: string | null): Promise<void>;
  /** Resolves `undefined` for a case that is absent or not owned by the signed-in account. */
  abstract read(caseId: string): Promise<StoredCase | undefined>;
  /** Acknowledges only after the server committed this exact snapshot. */
  abstract write(request: SaveRequest): Promise<{ version: number }>;
}

/** Stateless server adapter; translates HTTP outcomes into the store's vocabulary. */
@Injectable()
export class ServerCaseStorage extends CaseStorage {
  private readonly api = inject(CaseApi);

  async read(caseId: string): Promise<StoredCase | undefined> {
    try {
      return await this.api.open(caseId);
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 404) return undefined;
      throw error;
    }
  }

  async write({ document, version, key }: SaveRequest): Promise<{ version: number }> {
    try {
      return await this.api.save(document, version, key);
    } catch (error) {
      if (isVersionConflict(error)) throw new VersionConflict(error.error?.version ?? 0);
      throw error;
    }
  }
}
