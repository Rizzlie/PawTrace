import { computed, inject, Injectable, signal } from '@angular/core';
import {
  HttpClient,
  HttpErrorResponse,
  httpResource,
  type HttpInterceptorFn,
} from '@angular/common/http';
import { firstValueFrom, tap } from 'rxjs';
import { z } from 'zod';

const user = z.object({ id: z.uuid(), email: z.email() });

@Injectable({ providedIn: 'root' })
export class Session {
  private readonly http = inject(HttpClient);
  private readonly rejected = signal(false);
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

  reject(): void {
    this.rejected.set(true);
  }
  retry(): void {
    this.rejected.set(false);
    this.identity.reload();
  }
  async logout(): Promise<void> {
    this.logoutPending.set(true);
    this.logoutFailed.set(false);
    try {
      await firstValueFrom(this.http.post('/api/auth/logout', {}));
      this.rejected.set(true);
      // Reload also disposes the existing case module and its in-memory document.
      location.assign('/');
    } catch {
      this.logoutFailed.set(true);
    } finally {
      this.logoutPending.set(false);
    }
  }
}

export const sessionInterceptor: HttpInterceptorFn = (request, next) => {
  const session = inject(Session);
  return next(request).pipe(
    tap({
      error: (error: unknown) => {
        if (
          request.url.startsWith('/api/') &&
          request.url !== '/api/auth/me' &&
          error instanceof HttpErrorResponse &&
          error.status === 401
        )
          session.reject();
      },
    }),
  );
};
