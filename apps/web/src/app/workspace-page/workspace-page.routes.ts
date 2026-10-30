import { provideDispatcher } from '@ngrx/signals/events';
import type { Routes } from '@angular/router';
import { CaseStorage, CaseStore, ServerCaseStorage, workspaceRoutes } from '@pawtrace/workspace';
import { WorkspacePage } from './workspace-page';

export const workspacePageRoutes: Routes = [
  {
    path: '',
    component: WorkspacePage,
    providers: [
      ...provideDispatcher(),
      CaseStore,
      { provide: CaseStorage, useClass: ServerCaseStorage },
    ],
    children: workspaceRoutes,
  },
];
