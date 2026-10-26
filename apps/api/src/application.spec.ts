import type { NestExpressApplication } from "@nestjs/platform-express";
import { createApplication } from "./application";

describe("HTTP health endpoint", () => {
  let app: NestExpressApplication;
  afterEach(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });

  it.each(["", "pk.test-browser-token", "sk.never-expose"])(
    "serves only public map credentials (%s)",
    async (token) => {
      vi.stubEnv("MAPBOX_PUBLIC_TOKEN", token);
      app = await createApplication();
      await app.listen(0, "127.0.0.1");
      const response = await fetch(`${await app.getUrl()}/api/map-config`);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({
        mapboxToken: token.startsWith("pk.") ? token : "",
      });
    },
  );

  it("responds successfully over HTTP without infrastructure dependencies", async () => {
    app = await createApplication();
    await app.listen(0, "127.0.0.1");
    const response = await fetch(`${await app.getUrl()}/api/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
