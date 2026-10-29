import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { sessionInterceptor } from './session';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withRouterConfig } from '@angular/router';
import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    {
      provide: MAT_FORM_FIELD_DEFAULT_OPTIONS,
      useValue: { appearance: 'outline', subscriptSizing: 'dynamic' },
    },
    provideHttpClient(withXhr(), withInterceptors([sessionInterceptor])),
    provideRouter(appRoutes, withRouterConfig({ canceledNavigationResolution: 'computed' })),
  ],
};
