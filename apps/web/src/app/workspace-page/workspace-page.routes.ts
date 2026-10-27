import { provideDispatcher } from '@ngrx/signals/events';
import type { Routes } from '@angular/router';
import { CaseStore, workspaceRoutes } from '@pawtrace/workspace';
import { WorkspacePage } from './workspace-page';

export const workspacePageRoutes: Routes = [
  {
    path: '',
    component: WorkspacePage,
    providers: [...provideDispatcher(), CaseStore],
    children: workspaceRoutes,
  },
];
