import { expect, test } from "@playwright/test";

test("shell connects to the real API through the browser origin", async ({
  page,
  request,
}) => {
  const health = await request.get("/api/health");
  expect(health.ok()).toBeTruthy();
  expect(await health.json()).toEqual({ status: "ok" });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "PawTrace", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Połączono z serwerem");
  await expect
    .poll(() =>
      page
        .locator(".brand img")
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(0);
});
