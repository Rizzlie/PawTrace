import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  CASE_IDENTITY,
  CaseCopies,
  CopyFenced,
  type CaseCopy,
  type LocalAttempt,
} from '@pawtrace/browser-persistence';
import type { CaseDocument } from '@pawtrace/case-domain';
import { CaseStorage, ServerCaseStorage, type SaveRequest, type StoredCase } from './case-storage';
import { isUncertainOutcome, VersionConflict } from './case-api';

interface Scope {
  owner: string;
  generation: number;
  epoch: number;
  branch: string;
}
export class LocalSaveFailure extends Error {}
export class LocalOnly extends Error {}

/** Durable queue adapter. The store remains the sole owner of active committed/editing state. */
@Injectable()
export class DurableCaseStorage extends CaseStorage {
  private readonly identity = inject(CASE_IDENTITY);
  private readonly copies = inject(CaseCopies);
  private readonly server = inject(ServerCaseStorage);
  private readonly scopes = new Map<string, Promise<Scope>>();
  private readonly checkpoints = new Map<string, Promise<void>>();

  private scope(): Promise<Scope> {
    const owner = this.identity.owner();
    const generation = this.identity.generation();
    if (!owner) return Promise.reject(new CopyFenced());
    const key = owner + ':' + generation;
    let scope = this.scopes.get(key);
    if (!scope) {
      scope = Promise.all([this.copies.epoch(owner), this.copies.branch()]).then(
        ([epoch, branch]) => ({ owner, generation, epoch, branch }),
      );
      this.scopes.set(key, scope);
      void scope.catch(() => this.scopes.delete(key));
    }
    return scope;
  }
  private check(scope: Scope): void {
    if (scope.owner !== this.identity.owner() || scope.generation !== this.identity.generation())
      throw new CopyFenced();
  }
  private change<T>(scope: Scope, run: Parameters<CaseCopies['change']>[2]): Promise<T> {
    this.check(scope);
    return this.copies
      .change(scope.owner, scope.epoch, (copies, fence, store, owners) => {
        this.check(scope);
        return run(copies, fence, store, owners) as T;
      })
      .catch((error: unknown) => {
        if (error instanceof CopyFenced || error instanceof VersionConflict) throw error;
        throw new LocalSaveFailure(
          'Nie zapisano na urządzeniu. Zachowaj tę kartę i wyeksportuj JSON.',
        );
      });
  }
  private id(scope: Scope, caseId: string): string {
    return JSON.stringify([scope.owner, caseId, scope.branch]);
  }

  async read(caseId: string): Promise<StoredCase | undefined> {
    const { validateCaseDocument } = await import('@pawtrace/case-domain');
    const scope = await this.scope();
    const rows = await this.change<CaseCopy[]>(scope, (copies) =>
      copies.filter((c) => c.caseId === caseId),
    );
    const pending = rows.filter((c) => c.revision !== c.savedRevision || c.attempt || c.paused);
    const local = pending.find((c) => c.branch === scope.branch) ?? pending[0] ?? rows[0];
    if (local) {
      const parsed = validateCaseDocument(local.document);
      if (!parsed.success || parsed.data.case.id !== caseId)
        throw new Error('Invalid local snapshot; retained for recovery');
      if (pending.length || !navigator.onLine) {
        if (local.branch !== scope.branch && navigator.locks) {
          await navigator.locks.request(
            'pawtrace.tab.' + local.branch,
            { ifAvailable: true },
            async (lease) => {
              if (!lease) return;
              await this.change(scope, (copies, _fence, store) => {
                const unchanged = copies.find((c) => c.id === local.id);
                if (unchanged && unchanged.revision === local.revision) {
                  store.delete(local.id);
                  store.put({ ...unchanged, id: this.id(scope, caseId), branch: scope.branch });
                }
              });
            },
          );
        }
        // A reopened tab adopts its own branch. Other branches stay intact and block divergent writes.
        const paused =
          local.paused ||
          pending.some((c) => JSON.stringify(c.document) !== JSON.stringify(local.document));
        this.check(scope);
        return {
          document: parsed.data,
          version: local.version,
          revision: local.revision,
          savedRevision: local.savedRevision,
          paused,
        };
      }
    }
    try {
      const stored = await this.server.read(caseId);
      this.check(scope);
      if (stored) {
        const parsed = validateCaseDocument(stored.document);
        if (parsed.success)
          await this.change(scope, (_rows, _fence, store) =>
            store.put({
              id: this.id(scope, caseId),
              owner: scope.owner,
              caseId,
              branch: scope.branch,
              document: parsed.data,
              version: stored.version,
              revision: 0,
              savedRevision: 0,
              attempt: null,
              paused: false,
            } satisfies CaseCopy),
          );
      }
      return stored;
    } catch (error) {
      this.check(scope);
      if (local)
        return {
          document: local.document,
          version: local.version,
          revision: local.revision,
          savedRevision: local.savedRevision,
          paused: local.paused,
        };
      throw error;
    }
  }

  override checkpoint(document: CaseDocument, revision: number, version: number): Promise<void> {
    const scope = this.scope(); // Capture identity before any async queueing.
    const caseId = document.case.id;
    const previous = this.checkpoints.get(caseId) ?? Promise.resolve();
    const writing = previous
      .catch(() => undefined)
      .then(async () => {
        const captured = await scope;
        await this.change(captured, (rows, _fence, store) => {
          const id = this.id(captured, caseId);
          const old = rows.find((c) => c.id === id);
          store.put({
            id,
            owner: captured.owner,
            caseId,
            branch: captured.branch,
            version: old?.version ?? version,
            // A successful import starts a fresh store generation/revision sequence.
            savedRevision:
              old && revision < old.revision && old.revision === old.savedRevision
                ? 0
                : (old?.savedRevision ?? 0),
            attempt: old?.attempt ?? null,
            paused: old?.paused ?? false,
            document,
            revision,
          } satisfies CaseCopy);
        });
      });
    this.checkpoints.set(caseId, writing);
    return writing.catch((error: unknown) => {
      if (error instanceof CopyFenced) throw error;
      throw new LocalSaveFailure(
        'Nie zapisano na urządzeniu. Zachowaj tę kartę i wyeksportuj JSON.',
      );
    });
  }

  async write(request: SaveRequest & { revision?: number }): Promise<{ version: number }> {
    const scope = await this.scope();
    const caseId = request.document.case.id;
    await this.checkpoints.get(caseId);
    this.check(scope);
    if (!navigator.onLine) throw new LocalOnly();
    // Web Lock serializes server synchronization across tabs. IndexedDB protects local branches.
    if (!navigator.locks) throw new LocalOnly();
    return navigator.locks.request('pawtrace.sync.' + scope.owner + '.' + caseId, async () => {
      const id = this.id(scope, caseId);
      let copy = await this.change<CaseCopy>(scope, (rows, _fence, store) => {
        const own = rows.find((c) => c.id === id);
        if (!own) throw new LocalSaveFailure();
        const divergent = rows.some(
          (c) =>
            c.caseId === caseId &&
            c.id !== id &&
            (c.revision !== c.savedRevision || c.attempt || c.paused) &&
            JSON.stringify(c.document) !== JSON.stringify(own.document),
        );
        if (divergent || own.paused) {
          for (const row of rows.filter((c) => c.caseId === caseId))
            store.put({ ...row, paused: true });
          return { ...own, paused: true };
        }
        return own;
      });
      if (copy.paused) throw new VersionConflict(copy.version);
      const acknowledge = async (attempt: LocalAttempt, version: number) => {
        copy = await this.change<CaseCopy>(scope, (rows, _fence, store) => {
          const current = rows.find((c) => c.id === id);
          if (!current) throw new CopyFenced();
          const next = {
            ...current,
            version,
            savedRevision: attempt.revision,
            attempt: null,
            document: current.revision === attempt.revision ? attempt.document : current.document,
          };
          store.put(next);
          return next;
        });
      };
      const send = async (attempt: LocalAttempt) => {
        this.check(scope);
        try {
          const ack = await this.server.write(attempt);
          this.check(scope);
          await acknowledge(attempt, ack.version);
          return ack.version;
        } catch (error) {
          this.check(scope);
          await this.change(scope, (rows, _fence, store) => {
            const current = rows.find((c) => c.id === id);
            if (current)
              store.put({
                ...current,
                attempt: isUncertainOutcome(error) ? attempt : null,
                paused:
                  error instanceof VersionConflict ||
                  (error instanceof HttpErrorResponse && error.status === 404),
              });
          });
          if (error instanceof HttpErrorResponse && error.status === 404)
            throw new VersionConflict(0);
          throw error;
        }
      };
      if (copy.attempt) {
        const attempt = copy.attempt;
        const version = await send(attempt);
        // A replay acknowledges a historical mutation. It cannot authorize overwriting later work.
        const current = await this.server.read(caseId);
        this.check(scope);
        if (!current || current.version !== version) {
          await this.change(scope, (rows, _fence, store) => {
            const own = rows.find((c) => c.id === id);
            if (own) store.put({ ...own, paused: true });
          });
          throw new VersionConflict(current?.version ?? 0);
        }
        if (JSON.stringify(attempt.document) === JSON.stringify(request.document))
          return { version };
      }
      const attempt: LocalAttempt = {
        document: request.document,
        version: copy.version,
        key: request.key,
        revision: request.revision ?? copy.revision,
      };
      await this.change(scope, (rows, _fence, store) => {
        const own = rows.find((c) => c.id === id);
        if (!own) throw new CopyFenced();
        store.put({ ...own, attempt });
      });
      return { version: await send(attempt) };
    });
  }

  /** One bounded pass for cases left in the catalogue; never a background retry loop. */
  override async retryPending(except: string | null): Promise<void> {
    const scope = await this.scope();
    const rows = await this.change<CaseCopy[]>(scope, (copies) =>
      copies.filter(
        (c) =>
          c.branch === scope.branch &&
          c.caseId !== except &&
          !c.paused &&
          c.revision !== c.savedRevision,
      ),
    );
    for (const copy of rows) {
      this.check(scope);
      try {
        await this.write({
          document: copy.document,
          version: copy.version,
          revision: copy.revision,
          key: crypto.randomUUID(),
        });
      } catch {
        /* retained; next explicit pass */
      }
    }
  }
}
