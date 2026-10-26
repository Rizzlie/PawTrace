import type { NestExpressApplication } from "@nestjs/platform-express";
import { createApplication } from "./application";

describe("HTTP health endpoint", () => {
  let app: NestExpressApplication;
  afterEach(async () => {
    await app?.close();
  });

  it("responds successfully over HTTP without infrastructure dependencies", async () => {
    app = await createApplication();
    await app.listen(0, "127.0.0.1");
    const response = await fetch(`${await app.getUrl()}/api/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
