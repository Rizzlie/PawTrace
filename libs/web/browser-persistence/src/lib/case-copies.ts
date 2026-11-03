import { DestroyRef, inject, Injectable, InjectionToken, Injector } from '@angular/core';
import type { CaseDocument } from '@pawtrace/case-domain';
import type { CaseCopyCommands } from './case-copy-commands';
import type { CaseCopyDatabase } from './case-copy-database';
export { CopyFenced, CleanupPending } from './case-copy-record';

/** Identity comes from authenticated /me, never from a file or an anonymous snapshot. */
export const CASE_IDENTITY = new InjectionToken<{
  owner(): string | undefined;
  generation(): number;
  ready?(): Promise<boolean>;
}>('CASE_IDENTITY');

export interface LocalAttempt {
  replacement?: boolean;
  document: CaseDocument;
  version: number;
  key: string;
  revision: number;
}
export interface CaseCopy {
  /** Exact server-confirmed snapshot; absent on older, unproven records. */
  acknowledged?: { document: CaseDocument; revision: number; version: number };
  caseId: string;
  branch: string;
  document: CaseDocument;
  version: number;
  revision: number;
  savedRevision: number;
  attempt: LocalAttempt | null;
  paused: boolean;
}
export interface CopyScope {
  owner: string;
  generation: number;
  epoch: number;
  branch: string;
}
/** Transaction-completion durability and logout fences. No legacy database is opened/migrated. */
@Injectable({ providedIn: 'root' })
export class CaseCopies {
  private readonly injector = inject(Injector);
  private databaseReady?: Promise<CaseCopyDatabase>;
  private readonly branchReady: Promise<string>;

  constructor() {
    // A duplicated tab can inherit sessionStorage. A lifetime lock gives it a separate branch.
    let branch: string = crypto.randomUUID();
    try {
      branch = sessionStorage.getItem('pawtrace.case-branch.v1') ?? branch;
    } catch {
      /* IDB can still be available. */
    }
    let release!: () => void;
    const lifetime = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.branchReady = new Promise((resolve) => {
      if (!navigator.locks) {
        resolve(crypto.randomUUID());
        return;
      }
      const hold = async () => {
        try {
          sessionStorage.setItem('pawtrace.case-branch.v1', branch);
        } catch {
          /* Recovery can adopt an inactive branch. */
        }
        resolve(branch);
        await lifetime;
      };
      void navigator.locks.request(
        'pawtrace.tab.' + branch,
        { ifAvailable: true },
        async (lock) => {
          if (lock) await hold();
          else {
            branch = crypto.randomUUID();
            await navigator.locks.request('pawtrace.tab.' + branch, hold);
          }
        },
      );
    });
    inject(DestroyRef).onDestroy(() => release());
  }

  branch(): Promise<string> {
    return this.branchReady;
  }

  private database(): Promise<CaseCopyDatabase> {
    return (this.databaseReady ??= import('./case-copy-database').then(
      ({ CaseCopyDatabase }) => new CaseCopyDatabase(() => this.injector.get(CASE_IDENTITY)),
    ));
  }
  documents(): Promise<CaseCopyCommands> {
    return this.database().then((database) => database.documents());
  }
  epoch(owner: string): Promise<number> {
    return this.database().then((database) => database.epoch(owner));
  }
  list(owner: string): Promise<CaseCopy[]> {
    return this.database().then((database) => database.list(owner));
  }
  activate(owner: string): Promise<void> {
    return this.database().then((database) => database.activate(owner));
  }
  markLogout(owner: string): Promise<void> {
    return this.database().then((database) => database.markLogout(owner));
  }
  clear(owner: string): Promise<void> {
    return this.database().then((database) => database.clear(owner));
  }
}
