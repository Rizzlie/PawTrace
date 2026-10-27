import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppHeader } from './layout/app-header/app-header';

it('shows the application brand', async () => {
  TestBed.configureTestingModule({
    imports: [AppHeader],
    providers: [provideRouter([])],
  });
  localStorage.setItem('pawtrace.map-help.seen.v1', 'true');
  const fixture = TestBed.createComponent(AppHeader);
  await fixture.whenStable();
  const shell: HTMLElement = fixture.nativeElement;
  expect(shell.querySelector('h1')?.textContent).toContain('PawTrace');
  localStorage.removeItem('pawtrace.map-help.seen.v1');
});
