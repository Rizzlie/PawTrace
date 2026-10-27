import { test } from './fixtures';
import { expect } from '@playwright/test';

test('shell shows the brand without requesting API health', async ({ page }) => {
  const healthRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/health') healthRequests.push(request.url());
  });
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'PawTrace', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Mapa poszukiwań' })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Połączenie z serwerem' })).toHaveCount(0);
  await expect
    .poll(() =>
      page.locator('.brand img').evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(0);
  expect(healthRequests).toEqual([]);
});
