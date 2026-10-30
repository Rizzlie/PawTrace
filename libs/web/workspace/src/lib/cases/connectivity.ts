import { DestroyRef, inject, Service, signal } from '@angular/core';

/** Browser connectivity hint. A server request remains the authority on success. */
@Service()
export class Connectivity {
  private readonly state = signal(navigator.onLine);
  readonly online = this.state.asReadonly();

  constructor() {
    const update = () => this.state.set(navigator.onLine);
    addEventListener('online', update);
    addEventListener('offline', update);
    inject(DestroyRef).onDestroy(() => {
      removeEventListener('online', update);
      removeEventListener('offline', update);
    });
  }
}
