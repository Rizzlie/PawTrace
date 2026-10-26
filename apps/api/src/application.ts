import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { resolve } from "node:path";
import { AppModule } from "./app/app.module";

export async function createApplication(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix("api");
  app.enableShutdownHooks();
  if (process.env["WEB_ROOT"]) {
    app.useStaticAssets(resolve(process.env["WEB_ROOT"]));
  }
  return app;
}
