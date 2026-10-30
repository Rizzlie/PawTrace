import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Session } from '../session';

@Component({
  selector: 'app-login',
  imports: [MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<main>
    <h1>PawTrace</h1>
    <p>Prywatne miejsce do organizowania poszukiwań zwierzęcia.</p>
    @if (session.loading()) {
      <p role="status">Sprawdzanie sesji…</p>
    } @else {
      <p role="status">{{ message() }}</p>
      <a mat-flat-button href="/api/auth/login">Zaloguj się przez Google</a>
      @if (session.unavailable()) {
        <button mat-button (click)="session.retry()">Spróbuj ponownie</button>
      }
    }
  </main>`,
  styles: `
    :host {
      display: grid;
      place-items: center;
      flex: 1;
      padding: 24px;
    }
    main {
      max-width: 440px;
      background: var(--pt-surface);
      border: 1px solid var(--pt-border);
      border-radius: 16px;
      padding: 32px;
      box-shadow: var(--pt-shadow);
    }
    h1 {
      margin-top: 0;
    }
    p {
      line-height: 1.6;
    }
  `,
})
export class Login {
  protected readonly session = inject(Session);
  private readonly outcome = new URLSearchParams(location.search).get('login');
  protected readonly message = computed(() => {
    if (this.outcome === 'denied')
      return 'To konto nie ma dostępu. Spróbuj użyć innego konta Google.';
    if (this.outcome === 'cancelled') return 'Logowanie anulowane. Możesz spróbować ponownie.';
    if (this.outcome === 'failed') return 'Logowanie nie powiodło się. Spróbuj ponownie.';
    if (this.session.unavailable()) return 'Nie można sprawdzić sesji. Spróbuj ponownie.';
    if (this.session.expired()) return 'Sesja wygasła. Zaloguj się ponownie.';
    return 'Zaloguj się, aby kontynuować.';
  });
}
