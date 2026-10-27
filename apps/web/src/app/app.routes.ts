import type { Routes } from '@angular/router';

export const appRoutes: Routes = [
  {
    path: '',
    loadChildren: () =>
      import('./workspace-page/workspace-page.routes').then((m) => m.workspacePageRoutes),
  },
];
