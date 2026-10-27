import {
  createEnvironmentInjector,
  EnvironmentInjector,
  linkedSignal,
  runInInjectionContext,
} from '@angular/core';
import { form, type FieldTree } from '@angular/forms/signals';

/** Nonserializable form and navigation resources, never an alternative state owner. */
export class EditorForm<T> {
  binding: {
    id: number;
    fields: FieldTree<T>;
    injector: EnvironmentInjector;
  } | null = null;
  saving: AbortController | null = null;

  constructor(private readonly parent: EnvironmentInjector) {}

  bind(
    session: { id: number; draft: T },
    read: () => { id: number; draft: T } | null,
    write: (draft: T) => void,
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

  destroyBinding(): void {
    this.saving?.abort();
    this.saving = null;
    this.binding?.injector.destroy();
    this.binding = null;
  }

  destroy(): void {
    this.destroyBinding();
  }
}

/** A cancellable decision shared by every editor, never a document/draft owner. */
export class EditorTransition {
  private decision: { resolve: (leave: boolean) => void } | null = null;
  constructor(private readonly cancelSave: () => void) {}
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
    if (!leave && this.decision) this.cancelSave();
    this.decision?.resolve(leave);
    this.decision = null;
  }
}
