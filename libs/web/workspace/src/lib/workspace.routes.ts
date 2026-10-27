import { inject } from '@angular/core';
import {
  Router,
  type CanActivateFn,
  type CanDeactivateFn,
  type Routes,
  type UrlTree,
} from '@angular/router';
import { CaseStore } from './case-store/case-store';
import { Observable } from 'rxjs';

const openProfile: CanActivateFn = () => {
  const state = inject(CaseStore);
  const router = inject(Router);
  return new Observable<boolean | UrlTree>((subscriber) => {
    const cancellation = new AbortController();
    void state.initialize().then(async () => {
      if (cancellation.signal.aborted) return;
      const result = !state.document()
        ? router.parseUrl('/')
        : !state.busy() &&
          state.candidate() === null &&
          (!state.editor() ||
            state.editor()?.kind === 'profile' ||
            (await state.requestEditorExit(cancellation.signal)));
      subscriber.next(result);
      subscriber.complete();
    });
    return () => cancellation.abort();
  });
};

const leaveProfile: CanDeactivateFn<unknown> = () => {
  const state = inject(CaseStore);
  return new Observable<boolean>((subscriber) => {
    const cancellation = new AbortController();
    void state.requestEditorExit(cancellation.signal).then((leave) => {
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
