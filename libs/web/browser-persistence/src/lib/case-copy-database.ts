import type { CaseCopy, CopyScope } from './case-copies';
import { CaseCopyCommands } from './case-copy-commands';
import { CopyFenced, CleanupPending, snapshot, type CopyRecord } from './case-copy-record';

interface OwnerFence {
  owner: string;
  epoch: number;
  blocked: boolean;
  cleanupPending?: boolean;
}
const cleanupKey = (owner: string) => 'pawtrace.logout-cleanup.' + owner;

const result = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

/** Lazy database implementation. All representation and transaction callbacks stay here. */
export class CaseCopyDatabase {
  private database?: Promise<IDBDatabase>;
  private commandsReady?: CaseCopyCommands;
  constructor(
    private readonly identity: () => { owner(): string | undefined; generation(): number },
  ) {}

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
  private async change<T>(
    owner: string,
    epoch: number | null,
    change: (
      copies: CopyRecord[],
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
        result<CopyRecord[]>(store.getAll()),
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

  /** Session and epoch fences are checked inside the same transaction as every command. */
  private scoped<T>(
    scope: CopyScope,
    command: (rows: CopyRecord[], store: IDBObjectStore) => T,
  ): Promise<T> {
    return this.change(scope.owner, scope.epoch, (rows, _fence, store) => {
      // Resolve lazily: Session itself uses CaseCopies for logout/activation.
      const identity = this.identity();
      if (identity.owner() !== scope.owner || identity.generation() !== scope.generation)
        throw new CopyFenced();
      return command(rows, store);
    });
  }

  documents(): CaseCopyCommands {
    return (this.commandsReady ??= new CaseCopyCommands((scope, command) =>
      this.scoped(scope, command),
    ));
  }

  epoch(owner: string): Promise<number> {
    return this.change(owner, null, (_, fence) => {
      if (fence.blocked) throw new CopyFenced();
      return fence.epoch;
    });
  }
  list(owner: string): Promise<CaseCopy[]> {
    return this.change(owner, null, (copies) => copies.map(snapshot));
  }
  async activate(owner: string): Promise<void> {
    let marked = false;
    try {
      marked = !!localStorage.getItem(cleanupKey(owner));
    } catch {
      // Browser policy can deny localStorage while IndexedDB remains writable/readable.
    }
    if (marked) throw new CleanupPending();
    await this.change(owner, null, (_, fence, _store, owners) => {
      if (fence.cleanupPending) throw new CleanupPending();
      if (fence.blocked) owners.put({ ...fence, blocked: false });
    });
  }
  async markLogout(owner: string): Promise<void> {
    // Independent intent survives a failed copies-deletion transaction and a new login.
    let marked = false;
    try {
      localStorage.setItem(cleanupKey(owner), 'pending');
      marked = true;
    } catch {
      // A full/unavailable localStorage must not skip the independent durable IDB fence.
    }
    try {
      await this.change(owner, null, (_, fence, _store, owners) => {
        owners.put({ ...fence, epoch: fence.epoch + 1, blocked: true, cleanupPending: true });
      });
    } catch (error) {
      if (!marked) throw error;
    }
  }
  async clear(owner: string): Promise<void> {
    await this.change(owner, null, (copies, fence, store, owners) => {
      owners.put({ ...fence, epoch: fence.epoch + 1, blocked: true, cleanupPending: false });
      for (const copy of copies) store.delete(copy.id);
    });
    localStorage.removeItem(cleanupKey(owner));
  }
}
