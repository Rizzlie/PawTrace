import assert from 'node:assert/strict';
import completeFile from '@pawtrace/case-domain/fixtures/complete-case-v1.json';
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

async function expectAreaAlignedWithBasemaps(page: Page) {
  const panel = await page
    .getByRole('complementary', { name: 'Szczegóły obszaru', exact: true })
    .boundingBox();
  const basemaps = await page.getByRole('radiogroup', { name: 'Podkład mapy' }).boundingBox();
  assert(panel && basemaps, 'Expected visible area details and basemap controls');
  expect(panel.x + panel.width).toBeCloseTo(basemaps.x + basemaps.width, 0);
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
  await expectAreaAlignedWithBasemaps(page);
  await page.getByRole('button', { name: 'Edytuj obszar', exact: true }).focus();
  await page.locator('.leaflet-overlay-pane path.leaflet-interactive').hover();
  await expect(page.locator('.leaflet-tooltip').filter({ hasText: 'Las' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Nazwa obszaru', { exact: true })).toBeVisible();
  await expect(page.locator('.leaflet-tooltip').filter({ hasText: 'Las' })).toHaveCount(0);
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
  await page.getByRole('button', { name: 'Rozwiń miejsca', exact: true }).click();
  await page.getByRole('button', { name: 'Teren na telefonie', exact: true }).click();
  await expectAreaAlignedWithBasemaps(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('keeps repeated search snapshots visible after a plan is edited and removed, and restores JSON', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Rysuj koło', exact: true }).click();
  await page.getByLabel('Nazwa obszaru', { exact: true }).fill('Zagajnik');
  await page
    .getByRole('region', { name: 'Mapa poszukiwań' })
    .click({ position: { x: 530, y: 260 } });
  await page.getByLabel('Promień (m)', { exact: true }).fill('100');
  await page.getByRole('button', { name: 'Zapisz obszar', exact: true }).click();
  await page.getByRole('button', { name: 'Zagajnik', exact: true }).click();
  await page.getByRole('button', { name: 'Dodaj przeszukanie', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Wynik kontroli', exact: true })
    .selectOption('no_animal_or_signs');
  await page.getByLabel('Opis przeszukania', { exact: true }).fill('Cały zagajnik');
  await page.getByRole('button', { name: 'Zapisz przeszukanie', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Historia przeszukań (1)', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Dodaj przeszukanie', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Zasięg przeszukania', exact: true })
    .selectOption('custom');
  await page.getByLabel('Promień (m)', { exact: true }).fill('25');
  await page.getByLabel('Dokładność czasu').selectOption('date');
  await page.getByLabel('Data zdarzenia', { exact: true }).fill('2026-10-27');
  await page.getByLabel('Opis przeszukania', { exact: true }).fill('Fragment zagajnika');
  await page.getByRole('button', { name: 'Zapisz przeszukanie', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Historia przeszukań (2)', exact: true }),
  ).toBeVisible();
  const searched = await exportCase(page);
  await page.getByRole('button', { name: 'Edytuj obszar', exact: true }).click();
  await page.getByLabel('Promień (m)', { exact: true }).fill('200');
  await page.getByRole('button', { name: 'Zapisz obszar', exact: true }).click();
  await page.getByRole('button', { name: 'Usuń plan', exact: true }).click();
  await page.getByRole('button', { name: 'Potwierdź usunięcie planu', exact: true }).click();
  const removed = await exportCase(page);
  expect(removed.areas[0].plannedGeometry).toBeNull();
  expect(removed.areas[0].checks).toEqual(searched.areas[0].checks);
  await expect(page.locator('.leaflet-overlay-pane path.leaflet-interactive')).toHaveCount(2);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Zagajnik', exact: true })).toBeVisible();
  expect((await exportCase(page)).areas).toEqual(removed.areas);
  await page.getByLabel('Importuj plik JSON').setInputFiles({
    name: 'checks.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(removed)),
  });
  await page.getByRole('button', { name: 'Zastąp sprawę', exact: true }).click();
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano w przeglądarce');
  expect((await exportCase(page)).areas).toEqual(removed.areas);
});

test('records an unplanned polygon on a phone, cancels a correction and keeps recovery editable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano w przeglądarce');
  await page.getByRole('button', { name: 'Rozwiń miejsca', exact: true }).click();
  await page.getByRole('button', { name: 'Zapisz przeszukanie bez planu', exact: true }).click();
  await page.getByLabel('Nazwa obszaru', { exact: true }).fill('Obchód bez planu');
  const map = page.getByRole('region', { name: 'Mapa poszukiwań' });
  for (const position of [
    { x: 120, y: 220 },
    { x: 280, y: 220 },
    { x: 200, y: 250 },
  ])
    await map.click({ position });
  await page
    .getByRole('combobox', { name: 'Wynik kontroli', exact: true })
    .selectOption('animal_secured');
  await page.getByLabel('Metoda / przebieg kontroli', { exact: true }).fill('Obchód z latarką');
  await page.getByLabel('Oryginalny opis czasu').fill('Wieczorem');
  await page.screenshot({ path: resolve('../../.scratch/f10-phone.png') });
  await page.getByRole('button', { name: 'Zapisz przeszukanie', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Obchód bez planu', exact: true })).toBeVisible();
  const saved = await exportCase(page);
  expect(saved.areas[0]).toMatchObject({
    plannedGeometry: null,
    checks: [
      {
        result: 'animal_secured',
        occurredAt: { kind: 'unknown', description: 'Wieczorem' },
        actualGeometry: { type: 'polygon', vertices: expect.any(Array) },
      },
    ],
  });
  await page.getByRole('button', { name: 'Edytuj przeszukanie', exact: true }).click();
  await page.getByLabel('Opis przeszukania', { exact: true }).fill('Anulowane');
  await page.getByRole('button', { name: 'Dodaj punkt', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Niezatwierdzone przeszukanie', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Zostań przy edycji', exact: true }).click();
  await page.getByRole('button', { name: 'Anuluj przeszukanie', exact: true }).click();
  expect((await exportCase(page)).areas).toEqual(saved.areas);
  await page.reload();
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano w przeglądarce');
  expect((await exportCase(page)).areas).toEqual(saved.areas);
  await expect(page.getByRole('button', { name: 'Dodaj punkt', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('links one observation to an area check and repairs the link when the observation is removed', async ({
  page,
}) => {
  const file = { ...completeFile, mapView: { ...completeFile.mapView, basemap: 'osm' } };
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByLabel('Importuj plik JSON').setInputFiles({
    name: 'observations.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  });
  await expect(page.getByRole('dialog')).toContainText(completeFile.case.title);
  await page.getByRole('button', { name: 'Zastąp sprawę', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano w przeglądarce');
  const places = page.getByRole('complementary', { name: 'Miejsca', exact: true });
  await places.getByRole('button', { name: 'Park', exact: true }).click();
  await page.getByRole('button', { name: 'Dodaj przeszukanie', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Wynik kontroli', exact: true })
    .selectOption('animal_seen');
  await page.getByRole('button', { name: 'Zapisz przeszukanie', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('powiązaną obserwację');
  await page
    .getByRole('combobox', { name: 'Powiązana obserwacja', exact: true })
    .selectOption('observation-target');
  await page.getByLabel('Opis przeszukania', { exact: true }).fill('Widziano przy szopie');
  await page.screenshot({ path: resolve('../../.scratch/f10-desktop.png') });
  await page.getByRole('button', { name: 'Zapisz przeszukanie', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Historia przeszukań (2)', exact: true }),
  ).toBeVisible();
  const linked = await exportCase(page);
  expect(linked.points).toEqual(completeFile.points);
  const point = completeFile.points.find((item) => item.id === 'point-shed');
  assert(point, 'Expected shed');
  await places.getByRole('button', { name: point.name, exact: true }).click();
  const observation = point.entries.find((entry) => entry.id === 'observation-target');
  assert(observation?.description, 'Expected described observation');
  await page
    .getByRole('article', { name: observation.description, exact: true })
    .getByRole('button', { name: 'Usuń wpis', exact: true })
    .click();
  await page.getByRole('button', { name: 'Potwierdź usunięcie wpisu', exact: true }).click();
  const removed = await exportCase(page);
  const check = removed.areas.find((area) => area.id === 'area-park')?.checks.at(-1);
  expect(check).toMatchObject({ result: 'other_or_inconclusive', observationEntryId: null });
  expect(check?.description).toContain('observation-target');
  await page.reload();
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano w przeglądarce');
  expect((await exportCase(page)).areas).toEqual(removed.areas);
});
