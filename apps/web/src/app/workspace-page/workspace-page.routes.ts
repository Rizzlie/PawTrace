import { provideDispatcher } from '@ngrx/signals/events';
import type { Routes } from '@angular/router';
import {
  CaseStorage,
  CaseStore,
  DurableCaseStorage,
  ServerCaseStorage,
  workspaceRoutes,
} from '@pawtrace/workspace';
import { WorkspacePage } from './workspace-page';

export const workspacePageRoutes: Routes = [
  {
    path: '',
    component: WorkspacePage,
    providers: [
      ...provideDispatcher(),
      CaseStore,
      ServerCaseStorage,
      { provide: CaseStorage, useClass: DurableCaseStorage },
    ],
    children: workspaceRoutes,
  },
];
