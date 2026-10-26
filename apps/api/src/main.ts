import { Logger } from "@nestjs/common";
import { createApplication } from "./application";

async function bootstrap(): Promise<void> {
  const app = await createApplication();
  const port = Number(process.env["API_PORT"] ?? 3000);
  const host = process.env["API_HOST"] ?? "127.0.0.1";
  await app.listen(port, host);
  Logger.log(`PawTrace API listening on http://${host}:${port}/api`);
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
