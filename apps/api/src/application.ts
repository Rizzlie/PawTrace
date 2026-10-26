import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { resolve } from "node:path";
import { AppModule } from "./app/app.module";
import { ConfigService } from "@nestjs/config";
import type { Environment } from "./app/environment";

export async function createApplication(
  options: { envFilePath?: string; ignoreEnvFile?: boolean } = {},
): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(
    await AppModule.configure(options),
  );
  app.setGlobalPrefix("api");
  app.enableShutdownHooks();
  const webRoot = app
    .get(ConfigService<Environment, true>)
    .get("WEB_ROOT", { infer: true });
  if (webRoot) {
    app.useStaticAssets(resolve(webRoot));
  }
  return app;
}
