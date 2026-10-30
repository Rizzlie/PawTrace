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

/** Runs an async guard decision and aborts it when the router supersedes the navigation. */
const decide = <T>(decision: (signal: AbortSignal) => Promise<T>) =>
  new Observable<T>((subscriber) => {
    const cancellation = new AbortController();
    void decision(cancellation.signal).then((result) => {
      if (cancellation.signal.aborted) return;
      subscriber.next(result);
      subscriber.complete();
    });
    return () => cancellation.abort();
  });

const openCase: CanActivateFn = (route) => {
  const state = inject(CaseStore);
  void state.open(route.paramMap.get('caseId') ?? '');
  return true;
};

const showCatalogue: CanActivateFn = () => {
  inject(CaseStore).close();
  return true;
};

/** Leaving a case keeps a dirty draft decision and waits until committed edits reach the server. */
const leaveCase: CanDeactivateFn<unknown> = () => {
  const state = inject(CaseStore);
  return decide(
    async (signal) => (await state.requestEditorExit(signal)) && (await state.flush(signal)),
  );
};

const openProfile: CanActivateFn = () => {
  const state = inject(CaseStore);
  const router = inject(Router);
  return decide<boolean | UrlTree>(async (signal) => {
    await state.initialize();
    if (signal.aborted) return false;
    return !state.document()
      ? router.parseUrl(state.caseUrl())
      : !state.busy() &&
          state.candidate() === null &&
          (!state.editor() ||
            state.editor()?.kind === 'profile' ||
            (await state.requestEditorExit(signal)));
  });
};

const leaveProfile: CanDeactivateFn<unknown> = () => {
  const state = inject(CaseStore);
  return decide((signal) => state.requestEditorExit(signal));
};

const caseRoutes: Routes = [
  { path: '', pathMatch: 'full', children: [] },
  {
    path: 'profile',
    loadComponent: () => import('./animal-profile/animal-profile').then((m) => m.AnimalProfile),
    canActivate: [openProfile],
    canDeactivate: [leaveProfile],
  },
  { path: '**', redirectTo: '' },
];

/** `/` shows My cases over the map; `/cases/:caseId` opens one owned case in the workspace. */
export const workspaceRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [showCatalogue],
    loadComponent: () => import('./my-cases/my-cases').then((m) => m.MyCases),
  },
  {
    path: 'cases/:caseId',
    canActivate: [openCase],
    canDeactivate: [leaveCase],
    children: caseRoutes,
  },
  { path: '**', redirectTo: '' },
];
