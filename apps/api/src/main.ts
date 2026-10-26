import { Logger } from "@nestjs/common";
import { createApplication } from "./application";
import { ConfigService } from "@nestjs/config";
import type { Environment } from "./app/environment";

async function bootstrap(): Promise<void> {
  const app = await createApplication();
  const config = app.get(ConfigService<Environment, true>);
  const port = config.get("API_PORT", { infer: true });
  const host = config.get("API_HOST", { infer: true });
  await app.listen(port, host);
  Logger.log(`PawTrace API listening on http://${host}:${port}/api`);
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
