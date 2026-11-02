import { DestroyRef, inject, Injectable, InjectionToken } from '@angular/core';
import type { CaseDocument } from '@pawtrace/case-domain';

/** Identity comes from authenticated /me, never from a file or an anonymous snapshot. */
export const CASE_IDENTITY = new InjectionToken<{
  owner(): string | undefined;
  generation(): number;
  ready?(): Promise<boolean>;
}>('CASE_IDENTITY');

export interface LocalAttempt {
  document: CaseDocument;
  version: number;
  key: string;
  revision: number;
}
export interface CaseCopy {
  id: string;
  owner: string;
  caseId: string;
  branch: string;
  document: CaseDocument;
  version: number;
  revision: number;
  savedRevision: number;
  attempt: LocalAttempt | null;
  paused: boolean;
}
interface OwnerFence {
  owner: string;
  epoch: number;
  blocked: boolean;
  cleanupPending?: boolean;
}
export class CopyFenced extends Error {}
export class CleanupPending extends Error {}
const cleanupKey = (owner: string) => 'pawtrace.logout-cleanup.' + owner;

const result = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

/** Transaction-completion durability and logout fences. No legacy database is opened/migrated. */
@Injectable({ providedIn: 'root' })
export class CaseCopies {
  private database?: Promise<IDBDatabase>;
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

  private open(): Promise<IDBDatabase> {
    return (this.database ??= new Promise((resolve, reject) => {
      const request = indexedDB.open('pawtrace.owned-cases', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('copies', { keyPath: 'id' });
        request.result.createObjectStore('owners', { keyPath: 'owner' });
      };
      request.onerror = () => {
        this.database = undefined;
        reject(request.error);
      };
      request.onblocked = () => {
        this.database = undefined;
        reject(new Error('IndexedDB blocked'));
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          this.database = undefined;
        };
        resolve(request.result);
      };
    }));
  }

  /** All case and fence reads/writes share one transaction, including the final epoch check. */
  async change<T>(
    owner: string,
    epoch: number | null,
    change: (
      copies: CaseCopy[],
      fence: OwnerFence,
      store: IDBObjectStore,
      owners: IDBObjectStore,
    ) => T,
  ): Promise<T> {
    const database = await this.open();
    const transaction = database.transaction(['copies', 'owners'], 'readwrite', {
      durability: 'strict',
    });
    const finished = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
      transaction.onerror = () => reject(transaction.error);
    });
    // Attach rejection before requests so an explicit abort cannot become unhandled.
    void finished.catch(() => undefined);
    try {
      const store = transaction.objectStore('copies');
      const owners = transaction.objectStore('owners');
      const [all, storedFence] = await Promise.all([
        result<CaseCopy[]>(store.getAll()),
        result<OwnerFence | undefined>(owners.get(owner)),
      ]);
      const fence = storedFence ?? { owner, epoch: 0, blocked: false };
      if (epoch !== null && (fence.blocked || epoch !== fence.epoch)) throw new CopyFenced();
      const value = change(
        all.filter((copy) => copy.owner === owner),
        fence,
        store,
        owners,
      );
      await finished;
      return value;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        /* already completed/aborted */
      }
      await finished.catch(() => undefined);
      throw error;
    }
  }

  epoch(owner: string): Promise<number> {
    return this.change(owner, null, (_, fence) => {
      if (fence.blocked) throw new CopyFenced();
      return fence.epoch;
    });
  }
  list(owner: string): Promise<CaseCopy[]> {
    return this.change(owner, null, (copies) => copies);
  }
  async activate(owner: string): Promise<void> {
    if (localStorage.getItem(cleanupKey(owner))) throw new CleanupPending();
    await this.change(owner, null, (_, fence, _store, owners) => {
      if (fence.cleanupPending) throw new CleanupPending();
      if (fence.blocked) owners.put({ ...fence, blocked: false });
    });
  }
  async markLogout(owner: string): Promise<void> {
    // Independent intent survives a failed copies-deletion transaction and a new login.
    localStorage.setItem(cleanupKey(owner), 'pending');
    await this.change(owner, null, (_, fence, _store, owners) => {
      owners.put({ ...fence, epoch: fence.epoch + 1, blocked: true, cleanupPending: true });
    });
  }
  async clear(owner: string): Promise<void> {
    await this.change(owner, null, (copies, fence, store, owners) => {
      owners.put({ ...fence, epoch: fence.epoch + 1, blocked: true, cleanupPending: false });
      for (const copy of copies) store.delete(copy.id);
    });
    localStorage.removeItem(cleanupKey(owner));
  }
}
