import {
  createEnvironmentInjector,
  EnvironmentInjector,
  linkedSignal,
  runInInjectionContext,
} from '@angular/core';
import { form, type FieldTree } from '@angular/forms/signals';
import type { ProfileDraft } from '../animal-profile/profile-draft';
import type { ProfileSession } from './case-state';

/** Nonserializable form and navigation resources, never an alternative state owner. */
export class ProfileResources {
  binding: {
    id: number;
    fields: FieldTree<ProfileDraft>;
    injector: EnvironmentInjector;
  } | null = null;
  saving: AbortController | null = null;
  private decision: { resolve: (leave: boolean) => void } | null = null;

  constructor(private readonly parent: EnvironmentInjector) {}

  bind(
    session: ProfileSession,
    read: () => ProfileSession | null,
    write: (draft: ProfileDraft) => void,
  ): void {
    this.destroyBinding();
    const injector = createEnvironmentInjector([], this.parent);
    const fields = runInInjectionContext(injector, () =>
      form(
        linkedSignal(
          () => {
            const current = read();
            return current?.id === session.id ? current.draft : session.draft;
          },
          {
            set: (draft) => {
              if (read()?.id !== session.id) return;
              this.saving?.abort();
              write(draft);
            },
          },
        ),
      ),
    );
    this.binding = { id: session.id, fields, injector };
  }

  waitForClose(cancellation: AbortSignal | undefined, cancelled: () => void): Promise<boolean> {
    let resolve!: (leave: boolean) => void;
    const promise = new Promise<boolean>((done) => {
      resolve = done;
    });
    const decision = { resolve };
    this.decision = decision;
    const abort = () => {
      if (this.decision === decision) {
        this.finishClose(false);
        cancelled();
      }
    };
    cancellation?.addEventListener('abort', abort, { once: true });
    void promise.then(() => cancellation?.removeEventListener('abort', abort));
    return promise;
  }

  finishClose(leave: boolean): void {
    if (!leave && this.decision) this.saving?.abort();
    this.decision?.resolve(leave);
    this.decision = null;
  }

  destroyBinding(): void {
    this.saving?.abort();
    this.saving = null;
    this.binding?.injector.destroy();
    this.binding = null;
  }

  destroy(): void {
    this.finishClose(false);
    this.destroyBinding();
  }
}
