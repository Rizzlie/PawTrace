import { test } from './fixtures';
import { resolve } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { caseFileSchema } from '@pawtrace/case-domain';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.route('**/api/map-config', (route) => route.fulfill({ json: { mapboxToken: '' } }));
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"/>',
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Nowa sprawa', exact: true }).click();
  await page.getByRole('button', { name: 'Zastąp sprawę', exact: true }).click();
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano w przeglądarce');
  const initial = await exportCase(page);
  initial.mapView.zoom = 15;
  await page.getByLabel('Importuj plik JSON').setInputFiles({
    name: 'local-map.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(initial)),
  });
  await page.getByRole('button', { name: 'Zastąp sprawę', exact: true }).click();
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano w przeglądarce');
});
async function exportCase(page: Page) {
  await page.getByRole('button', { name: 'Plik JSON', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Eksportuj JSON', exact: true }).click();
  const stream = await (await download).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return caseFileSchema.parse(JSON.parse(Buffer.concat(chunks).toString()));
}

async function dragHandle(page: Page, title: string, dx: number, dy: number) {
  const handle = page.locator(`.pt-geometry-handle[title="${title}"]`);
  const box = await handle.boundingBox();
  if (!box) throw new Error('Expected geometry handle');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 8 });
  await page.mouse.up();
}
test('draws a circle from the shared toolbar, preserves a cancelled correction and round-trips JSON', async ({
  page,
}) => {
  const toolbar = page.getByRole('toolbar', { name: 'Działania na mapie' });
  await toolbar.getByRole('button', { name: 'Rysuj koło', exact: true }).click();
  await page.getByLabel('Nazwa obszaru', { exact: true }).fill('Las');
  const map = page.getByRole('region', { name: 'Mapa poszukiwań' });
  await map.click({ position: { x: 530, y: 260 } });
  await page.getByLabel('Promień (m)', { exact: true }).fill('100');
  await expect(page.getByLabel('Pomiary obszaru')).toContainText('31');
  expect((await exportCase(page)).areas).toHaveLength(0);
  await page.getByRole('button', { name: 'Zapisz obszar', exact: true }).click();
  await expect(page.getByLabel('Nazwa obszaru', { exact: true })).toBeHidden();
  const saved = await exportCase(page);
  expect(saved.areas[0].plannedGeometry).toMatchObject({ type: 'circle', radiusMeters: 100 });
  await page.getByRole('button', { name: 'Las', exact: true }).click();
  await page.getByRole('button', { name: 'Edytuj obszar', exact: true }).click();
  const before = await page.locator('.pt-geometry-handle[title="Środek koła"]').boundingBox();
  await dragHandle(page, 'Środek koła', 35, 25);
  expect(await page.locator('.pt-geometry-handle[title="Środek koła"]').boundingBox()).not.toEqual(
    before,
  );
  await page.getByLabel('Promień (m)', { exact: true }).fill('200');
  await page.getByRole('button', { name: 'Anuluj obszar', exact: true }).click();
  expect((await exportCase(page)).areas).toEqual(saved.areas);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Las', exact: true })).toBeVisible();
  await page.getByLabel('Importuj plik JSON').setInputFiles({
    name: 'areas.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await page.getByRole('button', { name: 'Zastąp sprawę', exact: true }).click();
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano w przeglądarce');
  expect((await exportCase(page)).areas).toEqual(saved.areas);
});

test('validates polygons, undoes a step, saves, removes the plan and measures without persisting', async ({
  page,
}) => {
  const map = page.getByRole('region', { name: 'Mapa poszukiwań' });
  await page.getByRole('button', { name: 'Rysuj wielokąt', exact: true }).click();
  await page.getByLabel('Nazwa obszaru', { exact: true }).fill('Pole');
  await map.click({ position: { x: 460, y: 260 } });
  await map.click({ position: { x: 620, y: 260 } });
  await page.getByRole('button', { name: 'Zapisz obszar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Nieprawidłowy obszar');
  await map.click({ position: { x: 560, y: 400 } });
  await map.click({ position: { x: 440, y: 400 } });
  await page.getByRole('button', { name: 'Cofnij krok', exact: true }).click();
  await expect(page.locator('.pt-geometry-handle')).toHaveCount(3);
  await dragHandle(page, 'Wierzchołek 3', 30, 10);
  await page.screenshot({ path: resolve('../../.scratch/f09-desktop.png') });
  await page.getByRole('button', { name: 'Zapisz obszar', exact: true }).click();
  await expect(page.getByLabel('Nazwa obszaru', { exact: true })).toBeHidden();
  const polygon = await exportCase(page);
  expect(polygon.areas[0].plannedGeometry).toMatchObject({
    type: 'polygon',
    vertices: expect.any(Array),
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Pole', exact: true })).toBeVisible();
  expect((await exportCase(page)).areas).toEqual(polygon.areas);
  await page.getByRole('button', { name: 'Pole', exact: true }).click();
  await page.getByRole('button', { name: 'Usuń plan', exact: true }).click();
  await page.getByRole('button', { name: 'Potwierdź usunięcie planu', exact: true }).click();
  expect((await exportCase(page)).areas).toHaveLength(0);
  await page.getByRole('button', { name: 'Zmierz odległość', exact: true }).click();
  await map.click({ position: { x: 460, y: 300 } });
  await map.click({ position: { x: 620, y: 350 } });
  await expect(page.getByLabel('Pomiar odległości')).toContainText(/\d.* m/);
  await page.getByRole('button', { name: 'Zakończ pomiar', exact: true }).click();
  expect((await exportCase(page)).areas).toHaveLength(0);
});

test('keeps area actions in the shared toolbar on a phone and cancels both geometry types', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano w przeglądarce');
  const toolbar = page.getByRole('toolbar', { name: 'Działania na mapie' });
  const map = page.getByRole('region', { name: 'Mapa poszukiwań' });
  const size = await map.boundingBox();
  for (const name of [
    'Moja lokalizacja',
    'Dodaj punkt',
    'Rysuj koło',
    'Rysuj wielokąt',
    'Zmierz odległość',
  ]) {
    await expect(toolbar.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await toolbar.getByRole('button', { name: 'Moja lokalizacja', exact: true }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(toolbar.getByRole('button', { name: 'Dodaj punkt', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(toolbar.getByRole('button', { name: 'Rysuj koło', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(toolbar.getByRole('button', { name: 'Rysuj wielokąt', exact: true })).toBeFocused();
  await toolbar.getByRole('button', { name: 'Rysuj koło', exact: true }).click();
  await page.screenshot({ path: resolve('../../.scratch/f09-phone-layout.png') });
  await map.click({ position: { x: 170, y: 220 } });
  await map.click({ position: { x: 280, y: 220 } });
  await page.getByLabel('Nazwa obszaru', { exact: true }).fill('Okrąg na telefonie');
  await page.screenshot({ path: resolve('../../.scratch/f09-phone.png') });
  await page.getByRole('button', { name: 'Anuluj obszar', exact: true }).click();
  await toolbar.getByRole('button', { name: 'Rysuj wielokąt', exact: true }).click();
  await map.click({ position: { x: 120, y: 220 } });
  await map.click({ position: { x: 280, y: 220 } });
  await map.click({ position: { x: 200, y: 230 } });
  await page.getByLabel('Nazwa obszaru', { exact: true }).fill('Teren na telefonie');
  await page.getByRole('button', { name: 'Zapisz obszar', exact: true }).click();
  await expect(page.getByLabel('Nazwa obszaru', { exact: true })).toBeHidden();
  expect((await exportCase(page)).areas).toHaveLength(1);
  expect(await map.boundingBox()).toEqual(size);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
