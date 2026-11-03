import type { CaseDocument } from '@pawtrace/case-domain';
import type { CaseCopy, CopyScope, LocalAttempt } from './case-copies';
import { CopyFenced, copyId, snapshot, type CopyRecord } from './case-copy-record';

/** Lazy persistence implementation; transaction callbacks never leave browser-persistence. */
export class CaseCopyCommands {
  constructor(
    private readonly run: <T>(
      scope: CopyScope,
      command: (rows: CopyRecord[], store: IDBObjectStore) => T,
    ) => Promise<T>,
  ) {}

  read(scope: CopyScope, caseId?: string): Promise<CaseCopy[]> {
    return this.run(scope, (rows) =>
      rows.filter((row) => !caseId || row.caseId === caseId).map(snapshot),
    );
  }

  /** Adopt only an inactive branch whose captured revision still exists. */
  async adopt(scope: CopyScope, copy: CaseCopy): Promise<void> {
    if (copy.branch === scope.branch || !navigator.locks) return;
    await navigator.locks.request(
      'pawtrace.tab.' + copy.branch,
      { ifAvailable: true },
      async (lease) => {
        if (!lease) return;
        await this.run(scope, (rows, store) => {
          const old = rows.find((row) => row.caseId === copy.caseId && row.branch === copy.branch);
          if (
            old &&
            old.revision === copy.revision &&
            JSON.stringify(old.document) === JSON.stringify(copy.document)
          ) {
            store.delete(old.id);
            store.put({ ...old, id: copyId(scope, copy.caseId), branch: scope.branch });
          }
        });
      },
    );
  }

  cache(scope: CopyScope, document: CaseDocument, version: number): Promise<void> {
    return this.run(scope, (_rows, store) => {
      store.put({
        id: copyId(scope, document.case.id),
        owner: scope.owner,
        caseId: document.case.id,
        branch: scope.branch,
        document,
        version,
        revision: 0,
        savedRevision: 0,
        acknowledged: { document, revision: 0, version },
        checkpointId: crypto.randomUUID(),
        attempt: null,
        paused: false,
      } satisfies CopyRecord);
    });
  }

  checkpoint(
    scope: CopyScope,
    document: CaseDocument,
    revision: number,
    version: number,
  ): Promise<void> {
    return this.run(scope, (rows, store) => {
      const id = copyId(scope, document.case.id);
      const old = rows.find((row) => row.id === id);
      store.put({
        id,
        owner: scope.owner,
        caseId: document.case.id,
        branch: scope.branch,
        document,
        revision,
        version: Math.max(old?.version ?? 0, version),
        savedRevision: -1,
        acknowledged: old?.acknowledged,
        checkpointId: crypto.randomUUID(),
        attemptCheckpoint: old?.attemptCheckpoint,
        attempt: old?.attempt ?? null,
        paused: old?.paused ?? false,
      } satisfies CopyRecord);
    });
  }

  /** Atomically inspect the current branch and retain every divergent branch as paused. */
  prepareSync(scope: CopyScope, caseId: string): Promise<CaseCopy | undefined> {
    return this.run(scope, (rows, store) => {
      const own = rows.find((row) => row.id === copyId(scope, caseId));
      if (!own) return undefined;
      const divergent = rows.some(
        (row) =>
          row.caseId === caseId &&
          row.id !== own.id &&
          (row.revision !== snapshot(row).savedRevision || row.attempt || row.paused) &&
          JSON.stringify(row.document) !== JSON.stringify(own.document),
      );
      if (divergent || own.paused) {
        for (const row of rows.filter((row) => row.caseId === caseId))
          store.put({ ...row, paused: true });
        return snapshot({ ...own, paused: true });
      }
      return snapshot(own);
    });
  }

  rememberAttempt(scope: CopyScope, caseId: string, attempt: LocalAttempt): Promise<void> {
    return this.run(scope, (rows, store) => {
      const own = rows.find((row) => row.id === copyId(scope, caseId));
      if (!own) throw new CopyFenced();
      store.put({ ...own, attempt, attemptCheckpoint: own.checkpointId });
    });
  }

  acknowledge(
    scope: CopyScope,
    caseId: string,
    attempt: LocalAttempt,
    version: number,
  ): Promise<CaseCopy> {
    return this.run(scope, (rows, store) => {
      const current = rows.find((row) => row.id === copyId(scope, caseId));
      if (!current) throw new CopyFenced();
      const next = {
        ...current,
        version,
        savedRevision: attempt.revision,
        acknowledged: { document: attempt.document, revision: attempt.revision, version },
        attempt: null,
        // Only replacement changes the checkpointed document. A later checkpoint wins,
        // even when its revision counter happens to equal the captured counter.
        document:
          attempt.replacement &&
          current.attempt?.key === attempt.key &&
          current.attemptCheckpoint &&
          current.attemptCheckpoint === current.checkpointId
            ? attempt.document
            : current.document,
      };
      store.put(next);
      return snapshot(next);
    });
  }

  failAttempt(
    scope: CopyScope,
    caseId: string,
    attempt: LocalAttempt | null,
    paused: boolean,
  ): Promise<void> {
    return this.run(scope, (rows, store) => {
      const current = rows.find((row) => row.id === copyId(scope, caseId));
      if (current) store.put({ ...current, attempt, paused });
    });
  }

  pause(scope: CopyScope, caseId: string): Promise<void> {
    return this.run(scope, (rows, store) => {
      const own = rows.find((row) => row.id === copyId(scope, caseId));
      if (own) store.put({ ...own, paused: true });
    });
  }
}
