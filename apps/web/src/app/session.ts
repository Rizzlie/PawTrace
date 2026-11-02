import { computed, DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { BrowserFiles, CaseCopies, CleanupPending } from '@pawtrace/browser-persistence';
import {
  HttpClient,
  HttpErrorResponse,
  httpResource,
  type HttpInterceptorFn,
} from '@angular/common/http';
import { firstValueFrom, tap, timeout } from 'rxjs';
import { z } from 'zod';

const user = z.object({ id: z.uuid(), email: z.email() });

@Injectable({ providedIn: 'root' })
export class Session {
  private readonly http = inject(HttpClient);
  private readonly rejected = signal(false);
  private readonly sequence = signal(0);
  readonly generation = this.sequence.asReadonly();
  private readonly copies = inject(CaseCopies);
  private readonly files = inject(BrowserFiles);
  private readonly channel =
    typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('pawtrace.session.v1');
  private readonly cleanup = signal<string | null>(null);
  readonly cleanupFailed = this.cleanup.asReadonly();
  private readonly recoveryFailed = signal(false);
  readonly exportFailed = this.recoveryFailed.asReadonly();
  private readonly identity = httpResource(() => '/api/auth/me', {
    parse: (value) => user.parse(value),
  });
  readonly user = computed(() =>
    !this.rejected() && !this.identity.isLoading() && this.identity.hasValue()
      ? this.identity.value()
      : undefined,
  );
  readonly loading = this.identity.isLoading;
  private readonly logoutFailed = signal(false);
  readonly failed = this.logoutFailed.asReadonly();
  readonly expired = computed(() => {
    const error = this.identity.error();
    return (
      this.rejected() ||
      (error instanceof HttpErrorResponse && error.error?.error === 'session_expired')
    );
  });
  readonly unavailable = computed(() => {
    const error = this.identity.error();
    return !!error && !(error instanceof HttpErrorResponse && error.status === 401);
  });
  private readonly logoutPending = signal(false);
  readonly signingOut = this.logoutPending.asReadonly();

  constructor() {
    this.channel?.addEventListener('message', (event: MessageEvent<unknown>) => {
      const message = event.data;
      if (
        message &&
        typeof message === 'object' &&
        'kind' in message &&
        message.kind === 'logout'
      ) {
        if ('owner' in message && typeof message.owner === 'string')
          this.cleanup.set(message.owner);
        this.reject();
      }
      if (
        message &&
        typeof message === 'object' &&
        'kind' in message &&
        message.kind === 'cleanupDone' &&
        'owner' in message &&
        message.owner === this.cleanup()
      )
        this.cleanup.set(null);
      if (
        message &&
        typeof message === 'object' &&
        'kind' in message &&
        message.kind === 'identity' &&
        'owner' in message &&
        this.user() &&
        message.owner !== this.user()?.id
      )
        this.reject();
    });
    inject(DestroyRef).onDestroy(() => this.channel?.close());
    // Activating a newly authenticated identity may lift the previous logout fence.
    effect(() => {
      const owner = this.user()?.id;
      if (owner) {
        this.channel?.postMessage({ kind: 'identity', owner });
        void this.copies.activate(owner).catch((error: unknown) => {
          if (error instanceof CleanupPending) {
            this.cleanup.set(owner);
            this.reject();
          }
        });
      }
    });
  }

  reject(): void {
    if (!this.rejected()) this.sequence.update((value) => value + 1);
    this.rejected.set(true);
  }
  retry(): void {
    this.rejected.set(false);
    this.identity.reload();
  }
  async logout(): Promise<void> {
    const owner = this.user()?.id;
    if (!owner || this.signingOut()) return;
    this.logoutPending.set(true);
    this.logoutFailed.set(false);
    try {
      await firstValueFrom(this.http.post('/api/auth/logout', {}).pipe(timeout(15_000)));
      this.reject();
      this.cleanup.set(owner);
      this.channel?.postMessage({ kind: 'logout', owner });
      await this.copies.markLogout(owner);
      await this.retryCleanup();
    } catch {
      this.logoutFailed.set(true);
    } finally {
      this.logoutPending.set(false);
    }
  }

  async retryCleanup(): Promise<void> {
    const owner = this.cleanup();
    if (!owner) return;
    try {
      await this.copies.clear(owner);
      this.channel?.postMessage({ kind: 'cleanupDone', owner });
      this.cleanup.set(null);
      location.assign('/');
    } catch {
      // Revocation already succeeded: access stays closed even when device cleanup fails.
      this.cleanup.set(owner);
    }
  }

  async exportCopies(except?: string): Promise<void> {
    const owner = this.user()?.id;
    const generation = this.generation();
    if (!owner) return;
    this.recoveryFailed.set(false);
    try {
      const copies = await this.copies.list(owner);
      const branch = await this.copies.branch();
      const { serializeCaseFile } = await import('@pawtrace/case-domain');
      if (owner !== this.user()?.id || generation !== this.generation()) return;
      for (const copy of copies.filter((copy) => copy.caseId !== except || copy.branch !== branch))
        this.files.download(
          serializeCaseFile(copy.document, new Date().toISOString()),
          `pawtrace-${copy.caseId}-${copy.branch}.json`,
        );
    } catch {
      this.recoveryFailed.set(true);
    }
  }
}

export const sessionInterceptor: HttpInterceptorFn = (request, next) => {
  const session = inject(Session);
  const owner = session.user()?.id;
  const generation = session.generation();
  const scoped =
    (request.url.startsWith('/api/cases') || request.url === '/api/auth/logout') && owner
      ? request.clone({ setHeaders: { 'X-PawTrace-Owner': owner } })
      : request;
  return next(scoped).pipe(
    tap({
      error: (error: unknown) => {
        if (
          request.url.startsWith('/api/') &&
          request.url !== '/api/auth/me' &&
          error instanceof HttpErrorResponse &&
          error.status === 401 &&
          generation === session.generation() &&
          owner === session.user()?.id
        )
          session.reject();
      },
    }),
  );
};
