import { Service } from "@angular/core";
import { openDB } from "idb";
import type { CaseDocument } from "@pawtrace/case-domain";

export interface SnapshotStorage {
  read(): Promise<unknown>;
  write(document: CaseDocument): Promise<void>;
}

/** One snapshot, acknowledged only when the read/write transaction completes. */
@Service()
export class BrowserSnapshot implements SnapshotStorage {
  private async open() {
    return openDB("pawtrace", 1, {
      upgrade: (db) => {
        db.createObjectStore("snapshots");
      },
    });
  }

  async read(): Promise<unknown> {
    const db = await this.open();
    try {
      return await db.get("snapshots", "current");
    } finally {
      db.close();
    }
  }

  async write(document: CaseDocument): Promise<void> {
    const db = await this.open();
    try {
      const transaction = db.transaction("snapshots", "readwrite");
      await Promise.all([
        transaction.store.put(document, "current"),
        transaction.done,
      ]);
    } finally {
      db.close();
    }
  }
}
