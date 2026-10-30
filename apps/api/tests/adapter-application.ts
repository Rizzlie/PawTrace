import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { WorkspaceModule } from '../src/app/app.module';

/** Isolated geocoder adapter regression harness, not the production application.
 * Runtime authorization is exercised separately through createApplication in authentication.spec.ts.
 * Photos have no adapter harness: they exist only inside an owned case (tests/photo-application.ts).
 */
export async function createApplication(
  options: { envFilePath?: string; ignoreEnvFile?: boolean } = {},
) {
  const app = await NestFactory.create<NestExpressApplication>(
    await WorkspaceModule.configure(options),
  );
  app.setGlobalPrefix('api');
  return app;
}
