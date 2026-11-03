import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  CASE_IDENTITY,
  CaseCopies,
  CopyFenced,
  type CopyScope,
  type LocalAttempt,
} from '@pawtrace/browser-persistence';
import type { CaseDocument } from '@pawtrace/case-domain';
import { CaseStorage, ServerCaseStorage, type SaveRequest, type StoredCase } from './case-storage';
import { isUncertainOutcome, VersionConflict } from './case-api';

export class LocalSaveFailure extends Error {}
export class LocalOnly extends Error {}

/** Durable queue adapter. The store remains the sole owner of active committed/editing state. */
@Injectable()
export class DurableCaseStorage extends CaseStorage {
  private readonly identity = inject(CASE_IDENTITY);
  private readonly copies = inject(CaseCopies);
  private readonly server = inject(ServerCaseStorage);
  private readonly scopes = new Map<string, Promise<CopyScope>>();
  private readonly checkpoints = new Map<string, Promise<void>>();

  private scope(): Promise<CopyScope> {
    const owner = this.identity.owner();
    const generation = this.identity.generation();
    if (!owner && this.identity.ready)
      return this.identity.ready().then((authenticated) => {
        if (!authenticated || generation !== this.identity.generation() || !this.identity.owner())
          throw new CopyFenced();
        return this.scope();
      });
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
  private check(scope: CopyScope): void {
    if (scope.owner !== this.identity.owner() || scope.generation !== this.identity.generation())
      throw new CopyFenced();
  }
  private async locally<T>(
    scope: CopyScope,
    run: (copies: Awaited<ReturnType<CaseCopies['documents']>>) => Promise<T>,
  ): Promise<T> {
    this.check(scope);
    try {
      return await run(await this.copies.documents());
    } catch (error) {
      if (error instanceof CopyFenced || error instanceof VersionConflict) throw error;
      throw new LocalSaveFailure(
        'Nie zapisano na urządzeniu. Zachowaj tę kartę i wyeksportuj JSON.',
      );
    }
  }

  async read(caseId: string): Promise<StoredCase | undefined> {
    const { validateCaseDocument } = await import('@pawtrace/case-domain');
    const scope = await this.scope();
    const rows = await this.locally(scope, (copies) => copies.read(scope, caseId));
    const pending = rows.filter((c) => c.revision !== c.savedRevision || c.attempt || c.paused);
    const local = pending.find((c) => c.branch === scope.branch) ?? pending[0] ?? rows[0];
    if (local) {
      const parsed = validateCaseDocument(local.document);
      if (!parsed.success || parsed.data.case.id !== caseId)
        throw new Error('Invalid local snapshot; retained for recovery');
      if (pending.length || !navigator.onLine) {
        await this.locally(scope, (copies) => copies.adopt(scope, local));
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
    let stored: StoredCase | undefined;
    try {
      stored = await this.server.read(caseId);
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
    try {
      this.check(scope);
      if (stored) {
        const parsed = validateCaseDocument(stored.document);
        if (parsed.success)
          await this.locally(scope, (copies) => copies.cache(scope, parsed.data, stored.version));
      }
      return stored;
    } catch (error) {
      this.check(scope);
      if (stored && error instanceof LocalSaveFailure)
        return { ...stored, localError: error.message };
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
        await this.locally(captured, (copies) =>
          copies.checkpoint(captured, document, revision, version),
        );
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
    return this.synchronize(scope, caseId, request);
  }

  private async synchronize(
    scope: CopyScope,
    caseId: string,
    request?: SaveRequest & { revision?: number },
  ): Promise<{ version: number }> {
    if (!navigator.onLine) throw new LocalOnly();
    // Web Lock serializes server synchronization across tabs. IndexedDB protects local branches.
    if (!navigator.locks) throw new LocalOnly();
    return navigator.locks.request('pawtrace.sync.' + scope.owner + '.' + caseId, async () => {
      const copy = await this.locally(scope, (copies) => copies.prepareSync(scope, caseId));
      if (!copy) throw new LocalSaveFailure();
      if (copy.paused) throw new VersionConflict(copy.version);
      // Select background work only after acquiring the per-case lock. A catalogue pass
      // can wait on another case while this one is opened, edited and acknowledged.
      if (!request) {
        if (copy.revision === copy.savedRevision && !copy.attempt) return { version: copy.version };
        request = {
          document: copy.document,
          revision: copy.revision,
          version: copy.version,
          key: crypto.randomUUID(),
        };
      }
      if (request.revision !== undefined && request.revision < copy.savedRevision)
        throw new LocalOnly();
      // A foreground writer may have queued this revision behind its background save.
      // Reuse that acknowledgement, then let the writer capture the newer pending edit.
      // Replacement candidates reuse a revision, so equal-revision documents must match.
      if (
        !copy.attempt &&
        request.revision === copy.savedRevision &&
        ((request.revision < copy.revision && request.version < copy.version) ||
          JSON.stringify(request.document) === JSON.stringify(copy.document))
      )
        return { version: copy.version };
      let version = request.version;
      const send = async (attempt: LocalAttempt) => {
        this.check(scope);
        try {
          const ack = await this.server.write(attempt);
          this.check(scope);
          await this.locally(scope, (copies) =>
            copies.acknowledge(scope, caseId, attempt, ack.version),
          );
          return ack.version;
        } catch (error) {
          this.check(scope);
          await this.locally(scope, (copies) =>
            copies.failAttempt(
              scope,
              caseId,
              isUncertainOutcome(error) ? attempt : null,
              error instanceof VersionConflict ||
                (error instanceof HttpErrorResponse && error.status === 404),
            ),
          );
          if (error instanceof HttpErrorResponse && error.status === 404)
            throw new VersionConflict(0);
          throw error;
        }
      };
      if (copy.attempt) {
        const attempt = copy.attempt;
        version = await send(attempt);
        // A replay acknowledges a historical mutation. It cannot authorize overwriting later work.
        const current = await this.server.read(caseId);
        this.check(scope);
        if (!current || current.version !== version) {
          await this.locally(scope, (copies) => copies.pause(scope, caseId));
          throw new VersionConflict(current?.version ?? 0);
        }
        if (JSON.stringify(attempt.document) === JSON.stringify(request.document))
          return { version };
      }
      const attempt: LocalAttempt = {
        document: request.document,
        version,
        key: request.key,
        revision: request.revision ?? copy.revision,
      };
      await this.locally(scope, (copies) => copies.rememberAttempt(scope, caseId, attempt));
      return { version: await send(attempt) };
    });
  }

  /** One bounded pass for cases left in the catalogue; never a background retry loop. */
  override async retryPending(except: string | null): Promise<void> {
    const scope = await this.scope();
    const rows = (await this.locally(scope, (copies) => copies.read(scope))).filter(
      (c) =>
        c.branch === scope.branch &&
        c.caseId !== except &&
        !c.paused &&
        c.revision !== c.savedRevision,
    );
    for (const copy of rows) {
      this.check(scope);
      try {
        await this.checkpoints.get(copy.caseId);
        await this.synchronize(scope, copy.caseId);
      } catch {
        /* retained; next explicit pass */
      }
    }
  }
}
