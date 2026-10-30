import { expect } from '@playwright/test';
import { authenticatedTest as test } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/map-config', (route) => route.fulfill({ json: { mapboxToken: '' } }));
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"/>',
    }),
  );
});

for (const width of [390, 1280]) {
  test(`shows help once and keeps it available from the header at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    const dialog = page.getByRole('dialog', { name: 'Jak korzystać z mapy' });
    const help = page.getByRole('banner').getByRole('button', { name: 'Jak korzystać z mapy' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Zamknij pomoc' })).toBeFocused();
    const bounds = await dialog.evaluate((element) => {
      const { x, width } = element.getBoundingClientRect();
      return { x, width };
    });
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    await dialog.getByRole('button', { name: 'Przejdź do mapy' }).click();
    await expect(dialog).toBeHidden();
    await expect(help).toBeFocused();
    await expect(help.locator('mat-icon svg')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('region', { name: 'Mapa poszukiwań' })).toBeVisible();
    await expect(dialog).toBeHidden();
    await help.focus();
    await page.keyboard.press('Enter');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(help).toBeFocused();
    await help.click();
    await expect(dialog).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(dialog).toBeHidden();
    await page.reload();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Przybliż', exact: true })).toBeVisible();
  });
}

test('keeps help usable when local storage is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException('Blocked', 'SecurityError');
    };
    Storage.prototype.setItem = () => {
      throw new DOMException('Blocked', 'SecurityError');
    };
  });
  await page.goto('/');
  const dialog = page.getByRole('dialog', { name: 'Jak korzystać z mapy' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Zamknij pomoc' }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Jak korzystać z mapy' }).click();
  await expect(dialog).toBeVisible();
});
