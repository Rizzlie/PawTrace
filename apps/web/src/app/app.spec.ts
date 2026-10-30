import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppHeader } from './layout/app-header/app-header';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';

it('shows the application brand', async () => {
  TestBed.configureTestingModule({
    imports: [AppHeader],
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
  });
  localStorage.setItem('pawtrace.map-help.seen.v1', 'true');
  const fixture = TestBed.createComponent(AppHeader);
  const http = TestBed.inject(HttpTestingController);
  const request = await vi.waitFor(() => http.expectOne('/api/auth/me'));
  request.flush({}, { status: 401, statusText: 'Unauthorized' });
  await fixture.whenStable();
  const shell: HTMLElement = fixture.nativeElement;
  expect(shell.querySelector('h1')?.textContent).toContain('PawTrace');
  localStorage.removeItem('pawtrace.map-help.seen.v1');
});
