import { createServer, type Server } from "node:http";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { createApplication } from "./application";

describe("submitted address search over HTTP", () => {
  let app: NestExpressApplication;
  let upstream: Server;
  let base: string;
  const requests: { url: URL; userAgent: string | undefined; time: number }[] =
    [];
  let status = 200;
  let body: unknown = [];
  let retryAfter = "";

  beforeEach(async () => {
    requests.length = 0;
    status = 200;
    retryAfter = "";
    body = [
      {
        osm_type: "node",
        osm_id: 123,
        display_name: "Warszawa, Polska",
        lat: "52.23",
        lon: "21.01",
        address: { country_code: "pl" },
      },
    ];
    upstream = createServer((request, response) => {
      requests.push({
        url: new URL(request.url ?? "/", "http://localhost"),
        userAgent: request.headers["user-agent"],
        time: performance.now(),
      });
      if (status === -1) {
        response.destroy();
        return;
      }
      if (retryAfter) response.setHeader("Retry-After", retryAfter);
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(body));
    });
    await new Promise<void>((resolve) =>
      upstream.listen(0, "127.0.0.1", resolve),
    );
    const address = upstream.address();
    if (!address || typeof address === "string")
      throw new Error("No upstream port");
    vi.stubEnv("ADDRESS_SEARCH_URL", `http://127.0.0.1:${address.port}/search`);
    app = await createApplication();
    await app.listen(0, "127.0.0.1");
    base = `${await app.getUrl()}/api/address-search`;
  });

  afterEach(async () => {
    await app?.close();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
    vi.unstubAllEnvs();
  });

  it("returns explicit coordinates and labels from a Poland-restricted identified request", async () => {
    const response = await fetch(`${base}?q=Warszawa`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      results: [
        {
          id: "node:123",
          label: "Warszawa, Polska",
          latitude: 52.23,
          longitude: 21.01,
        },
      ],
      attribution: {
        label: "© OpenStreetMap contributors",
        url: "https://www.openstreetmap.org/copyright",
      },
    });
    expect(requests[0].url.pathname).toBe("/search");
    expect(Object.fromEntries(requests[0].url.searchParams)).toEqual({
      q: "Warszawa",
      countrycodes: "pl",
      format: "jsonv2",
      addressdetails: "1",
      limit: "5",
      "accept-language": "pl",
    });
    expect(requests[0].userAgent).toContain("PawTrace");
  });

  it("shares a serialized one-per-second queue, coalesces concurrent duplicates and caches normalized queries", async () => {
    const responses = await Promise.all([
      fetch(`${base}?q=Warszawa`),
      fetch(`${base}?q=%20warszawa%20`),
      fetch(`${base}?q=Kraków`),
    ]);
    expect(responses.map((response) => response.status)).toEqual([
      200, 200, 200,
    ]);
    expect(requests).toHaveLength(2);
    expect(requests[1].time - requests[0].time).toBeGreaterThanOrEqual(1000);
    const cached = await fetch(`${base}?q=WARSZAWA`);
    expect(await cached.json()).toEqual(await responses[0].json());
    expect(requests).toHaveLength(2);
  });

  it("observes provider Retry-After across clients without automatic retry", async () => {
    status = 429;
    retryAfter = "2";
    expect((await fetch(`${base}?q=Warszawa`)).status).toBe(503);
    expect(requests).toHaveLength(1);
    status = 200;
    expect((await fetch(`${base}?q=Kraków`)).status).toBe(200);
    expect(requests[1].time - requests[0].time).toBeGreaterThanOrEqual(2000);
  });

  it.each([
    "",
    "?q=a",
    "?q=%20%20",
    "?q=Warszawa&q=Kraków",
    `?q=${"a".repeat(201)}`,
    "?q=War%00szawa",
  ])(
    "rejects invalid input before contacting the provider (%s)",
    async (query) => {
      expect((await fetch(`${base}${query}`)).status).toBe(400);
      expect(requests).toHaveLength(0);
    },
  );

  it("caches an empty response and excludes locations outside Poland", async () => {
    body = [
      {
        osm_type: "node",
        osm_id: 2,
        display_name: "Berlin",
        lat: "52.52",
        lon: "13.40",
        address: { country_code: "de" },
      },
    ];
    const first = await fetch(`${base}?q=Berlin`);
    expect(await first.json()).toMatchObject({ results: [] });
    expect(await (await fetch(`${base}?q=Berlin`)).json()).toMatchObject({
      results: [],
    });
    expect(requests).toHaveLength(1);
  });

  it.each([500, -1])(
    "keeps the queue recoverable after upstream failure %s without caching the failure",
    async (failure) => {
      status = failure;
      expect((await fetch(`${base}?q=Warszawa`)).status).toBe(502);
      expect(requests).toHaveLength(1);
      status = 200;
      expect((await fetch(`${base}?q=Warszawa`)).status).toBe(200);
      expect(requests).toHaveLength(2);
    },
  );

  it.each([
    {},
    [{ lat: "NaN" }],
    [
      {
        osm_type: "node",
        osm_id: 1,
        display_name: "Invalid",
        lat: "91",
        lon: "21",
        address: { country_code: "pl" },
      },
    ],
  ])("reports malformed provider data as a service error", async (invalid) => {
    body = invalid;
    expect((await fetch(`${base}?q=Warszawa`)).status).toBe(502);
  });
});
