import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { CaseDocument } from '@pawtrace/case-domain';
import { CaseApi, isVersionConflict, VersionConflict } from './case-api';

export interface StoredCase {
  document: unknown;
  version: number;
}
/** One save: the captured document, the version it is based on and its idempotency key. */
export interface SaveRequest {
  document: CaseDocument;
  version: number;
  key: string;
}

/**
 * Snapshot persistence seam of the workspace store. Implementations hold no bookkeeping: the
 * acknowledged version and any unresolved attempt belong to `CaseState.persistence`.
 */
export abstract class CaseStorage {
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
