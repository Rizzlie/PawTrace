import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

it('keeps the private shell absent while identity is unknown and offers login after expiry', async () => {
  TestBed.configureTestingModule({
    imports: [App],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  const fixture = TestBed.createComponent(App);
  const http = TestBed.inject(HttpTestingController);
  const request = await vi.waitFor(() => http.expectOne('/api/auth/me'));
  const shell: HTMLElement = fixture.nativeElement;
  expect(shell.querySelector('router-outlet')).toBeNull();
  request.flush({ error: 'session_expired' }, { status: 401, statusText: 'Unauthorized' });
  await fixture.whenStable();
  expect(shell.textContent).toContain('Sesja wygasła');
  expect(shell.querySelector('a')?.getAttribute('href')).toBe('/api/auth/login');
  expect(shell.querySelector('router-outlet')).toBeNull();
  http.verify();
});
