import { expect, test } from "@playwright/test";

const result = {
  id: "node:123",
  label: "Warszawa, Polska",
  latitude: 52.23,
  longitude: 21.01,
};
const attribution = {
  label: "© OpenStreetMap contributors",
  url: "https://www.openstreetmap.org/copyright",
};

test.beforeEach(async ({ page }) => {
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#dce8d1"/></svg>',
    }),
  );
  await page.route("**/api/map-config", (route) =>
    route.fulfill({ json: { mapboxToken: "" } }),
  );
});

test("only searches on submission and selecting a result moves the real map without creating a point", async ({
  page,
}) => {
  const queries: string[] = [];
  await page.route("**/api/address-search?*", async (route) => {
    queries.push(new URL(route.request().url()).searchParams.get("q") ?? "");
    await route.fulfill({ json: { results: [result], attribution } });
  });
  await page.goto("/");
  const input = page.getByRole("searchbox", { name: "Adres w Polsce" });
  await input.fill("Warszawa");
  const map = page.getByRole("region", { name: "Mapa poszukiwań" });
  await map.focus();
  await page.keyboard.press("ArrowRight");
  // Observe beyond ordinary autocomplete debounce windows; this is a negative assertion.
  // eslint-disable-next-line playwright/no-wait-for-timeout
  await page.waitForTimeout(1100);
  expect(queries).toEqual([]);
  await input.press("Enter");
  await expect(
    page.getByRole("button", { name: result.label, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: result.label, exact: true }).click();
  await expect(
    page.getByRole("status", { name: "Wybrane miejsce" }),
  ).toHaveText("Wybrano: Warszawa, Polska");
  // Leaflet requests z=15 tiles containing the selected latitude/longitude.
  await expect(
    map.locator('img.leaflet-tile-loaded[src*="/15/18296/10789.png"]').first(),
  ).toBeVisible();
  await expect(map.locator(".leaflet-marker-icon")).toHaveCount(0);
  expect(queries).toEqual(["Warszawa"]);
  await expect(
    page.getByRole("link", { name: attribution.label, exact: true }),
  ).toBeVisible();
});

test("shows loading, empty and error states while manual map navigation remains usable", async ({
  page,
}) => {
  let calls = 0;
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/address-search?*", async (route) => {
    calls++;
    if (calls === 1) {
      await held;
      await route.fulfill({ json: { results: [], attribution } });
    } else {
      await route.fulfill({
        status: 503,
        json: { message: "Provider unavailable" },
      });
    }
  });
  await page.goto("/");
  const input = page.getByRole("searchbox", { name: "Adres w Polsce" });
  await input.fill("Nieznany adres");
  await page.getByRole("button", { name: "Szukaj", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Wyszukiwanie adresu…" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Szukaj", exact: true }),
  ).toBeDisabled();
  release();
  await expect(
    page.getByText("Nie znaleziono adresu w Polsce.", { exact: false }),
  ).toBeVisible();
  await input.fill("Warszawa");
  await input.press("Enter");
  await expect(page.getByRole("alert")).toContainText(
    "Nie udało się wyszukać adresu",
  );
  const scale = page.locator(".leaflet-control-scale-line");
  const original = await scale.textContent();
  await page.getByRole("region", { name: "Mapa poszukiwań" }).focus();
  await page.keyboard.press("+");
  await expect(scale).not.toHaveText(original ?? "");
  // No automatic retry follows a service failure.
  // eslint-disable-next-line playwright/no-wait-for-timeout
  await page.waitForTimeout(1100);
  expect(calls).toBe(2);
});

test("does not offer results for an address edited while the submitted search was pending", async ({
  page,
}) => {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/address-search?*", async (route) => {
    await held;
    await route.fulfill({ json: { results: [result], attribution } });
  });
  await page.goto("/");
  const input = page.getByRole("searchbox", { name: "Adres w Polsce" });
  await input.fill("Warszawa");
  await input.press("Enter");
  await expect(
    page.getByRole("status").filter({ hasText: "Wyszukiwanie adresu…" }),
  ).toBeVisible();
  await input.fill("Kraków");
  release();
  await expect(
    page.getByRole("button", { name: "Szukaj", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: result.label, exact: true }),
  ).toHaveCount(0);
});
