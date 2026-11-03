import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { Session, sessionInterceptor } from './session';
import { CASE_IDENTITY } from '@pawtrace/browser-persistence';
import { ApplicationConfig, inject, provideBrowserGlobalErrorListeners } from '@angular/core';
import {
  PreloadAllModules,
  provideRouter,
  withPreloading,
  withRouterConfig,
} from '@angular/router';
import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    {
      provide: CASE_IDENTITY,
      useFactory: () => {
        const session = inject(Session);
        return {
          owner: () => session.user()?.id,
          generation: session.generation,
          ready: () => session.ready(),
        };
      },
    },
    {
      provide: MAT_FORM_FIELD_DEFAULT_OPTIONS,
      useValue: { appearance: 'outline', subscriptSizing: 'dynamic' },
    },
    provideHttpClient(withXhr(), withInterceptors([sessionInterceptor])),
    provideRouter(
      appRoutes,
      withPreloading(PreloadAllModules),
      withRouterConfig({ canceledNavigationResolution: 'computed' }),
    ),
  ],
};
