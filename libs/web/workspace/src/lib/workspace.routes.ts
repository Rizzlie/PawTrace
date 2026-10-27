import { inject } from '@angular/core';
import { Router, type CanActivateFn, type CanDeactivateFn, type Routes } from '@angular/router';
import { CaseStore } from './case-store/case-store';
import { Observable } from 'rxjs';

const openProfile: CanActivateFn = async () => {
  const state = inject(CaseStore);
  const router = inject(Router);
  await state.initialize();
  if (!state.document()) return router.parseUrl('/');
  return !state.busy() && state.candidate() === null;
};

const leaveProfile: CanDeactivateFn<unknown> = () => {
  const state = inject(CaseStore);
  return new Observable<boolean>((subscriber) => {
    const cancellation = new AbortController();
    void state.requestProfileExit(cancellation.signal).then((leave) => {
      subscriber.next(leave);
      subscriber.complete();
    });
    return () => cancellation.abort();
  });
};

export const workspaceRoutes: Routes = [
  { path: '', pathMatch: 'full', children: [] },
  {
    path: 'profile',
    loadComponent: () => import('./animal-profile/animal-profile').then((m) => m.AnimalProfile),
    canActivate: [openProfile],
    canDeactivate: [leaveProfile],
  },
  { path: '**', redirectTo: '' },
];
