import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { WorkspaceModule } from '../src/app/app.module';

/** Isolated storage/geocoder adapter regression harness, not the production application.
 * Runtime authorization is exercised separately through createApplication in authentication.spec.ts.
 * P01 deliberately makes ownerless storage unreachable; P03 supplies owned photo routes.
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
