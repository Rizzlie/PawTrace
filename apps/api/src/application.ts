import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json } from 'express';
import { resolve } from 'node:path';
import { AppModule } from './app/app.module';
import { ConfigService } from '@nestjs/config';
import type { Environment } from './app/environment';
import type { AuthenticationDependencies } from './auth/authentication';

export async function createApplication(
  options: {
    envFilePath?: string;
    ignoreEnvFile?: boolean;
    authentication?: AuthenticationDependencies;
  } = {},
): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(await AppModule.configure(options), {
    abortOnError: false,
  });
  app.setGlobalPrefix('api');
  // Complete case documents are JSON transport; every other route keeps the 100 kB default.
  // Nest omits its own parser once any JSON parser exists, so the default is registered too.
  app.use('/api/cases', json({ limit: '10mb' }));
  app.useBodyParser('json');
  app.enableShutdownHooks();
  const settings = app.get(ConfigService<Environment, true>);
  if (new URL(settings.get('PUBLIC_ORIGIN', { infer: true })).protocol === 'https:')
    app.set('trust proxy', 1);
  const webRoot = app.get(ConfigService<Environment, true>).get('WEB_ROOT', { infer: true });
  if (webRoot) {
    app.useStaticAssets(resolve(webRoot));
    app
      .getHttpAdapter()
      .getInstance()
      .get(
        '/{*path}',
        (
          request: import('express').Request,
          response: import('express').Response,
          next: import('express').NextFunction,
        ) => {
          if (
            request.path === '/api' ||
            request.path.startsWith('/api/') ||
            !request.accepts('html')
          )
            return next();
          return response.sendFile('index.html', { root: resolve(webRoot) });
        },
      );
  }
  return app;
}
