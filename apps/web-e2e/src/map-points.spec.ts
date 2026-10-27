import { test } from './fixtures';
import { expect, type Page, type Locator } from '@playwright/test';
import { caseFileSchema } from '@pawtrace/case-domain';
import completeFile from '@pawtrace/case-domain/fixtures/complete-case-v1.json';
import { resolve } from 'node:path';

async function markerBox(marker: Locator) {
  const box = await marker.boundingBox();
  if (!box) throw new Error('Expected candidate marker');
  return box;
}

async function savePoint(page: Page) {
  await page.getByRole('button', { name: 'Zapisz punkt', exact: true }).click();
  await expect(page.getByLabel('Nazwa punktu')).toBeHidden();
}

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

async function importCase(page: Page, file: unknown) {
  await page.getByLabel('Importuj plik JSON').setInputFiles({
    name: 'points.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  });
  await page.getByRole('button', { name: 'Zastąp sprawę', exact: true }).click();
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano w przeglądarce');
}

test('creates by map click and drag, cancels a candidate, and collapses without resizing the map', async ({
  page,
}) => {
  const map = page.getByRole('region', { name: 'Mapa poszukiwań' });
  const canvas = await map.boundingBox();
  await page.getByRole('button', { name: 'Dodaj punkt', exact: true }).click();
  await map.click({ position: { x: 560, y: 300 } });
  const latitude = page.getByLabel('Szerokość geograficzna');
  await expect(latitude).not.toHaveValue('');
  const before = await latitude.inputValue();
  const marker = page.locator('.leaflet-marker-icon[title="Położenie szkicu"]');
  const box = await markerBox(marker);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 70, { steps: 8 });
  await page.mouse.up();
  await expect(latitude).not.toHaveValue(before);
  const expected = {
    latitude: Number(await latitude.inputValue()),
    longitude: Number(await page.getByLabel('Długość geograficzna').inputValue()),
  };
  await page.getByLabel('Nazwa punktu').fill('Kryjówka');
  await page.getByLabel('Potencjalna kryjówka', { exact: true }).check();
  await page.getByLabel('Fotopułapka', { exact: true }).check();
  await savePoint(page);
  const saved = await exportCase(page);
  expect(saved.points[0]).toMatchObject({
    name: 'Kryjówka',
    coordinates: expected,
    roles: ['potential_hiding_place', 'trail_camera'],
  });
  await page.getByRole('button', { name: 'Dodaj punkt', exact: true }).click();
  await map.click({ position: { x: 550, y: 350 } });
  await page.getByLabel('Nazwa punktu').fill('Nie zapisuj');
  await page.getByRole('button', { name: 'Anuluj punkt', exact: true }).click();
  expect((await exportCase(page)).points).toEqual(saved.points);
  await page.getByRole('button', { name: 'Zwiń miejsca', exact: true }).click();
  expect(await map.boundingBox()).toEqual(canvas);
  await page.getByRole('button', { name: 'Rozwiń miejsca', exact: true }).click();
  await page.reload();
  await expect(
    page
      .getByRole('complementary', { name: 'Miejsca', exact: true })
      .getByRole('button', { name: 'Kryjówka', exact: true }),
  ).toBeVisible();
  expect((await exportCase(page)).points).toEqual(saved.points);
});

test('address selection navigates ordinarily and places a candidate only during editing', async ({
  page,
}) => {
  await page.route('**/api/address-search?*', (route) =>
    route.fulfill({
      json: {
        results: [{ id: 'address', label: 'Adres testowy', latitude: 52.23, longitude: 21.01 }],
        attribution: { label: 'Test', url: 'https://example.com' },
      },
    }),
  );
  const search = async () => {
    await page.getByRole('searchbox', { name: 'Adres w Polsce' }).fill('Warszawa');
    await page.getByRole('button', { name: 'Szukaj', exact: true }).click();
    await page.getByRole('button', { name: 'Adres testowy' }).click();
  };
  await search();
  expect((await exportCase(page)).points).toEqual([]);
  await page.getByRole('button', { name: 'Dodaj punkt', exact: true }).click();
  await search();
  await expect(page.getByLabel('Szerokość geograficzna')).toHaveValue('52.23');
  await expect(page.getByLabel('Długość geograficzna')).toHaveValue('21.01');
  await page.getByLabel('Nazwa punktu').fill('Adres');
  await savePoint(page);
  expect((await exportCase(page)).points[0].coordinates).toEqual({
    latitude: 52.23,
    longitude: 21.01,
  });
});

test('preserves imported history through editing and JSON transfer, and safely deletes referenced places', async ({
  page,
}) => {
  await importCase(page, completeFile);
  const point = completeFile.points[1];
  await page
    .getByRole('complementary', { name: 'Miejsca', exact: true })
    .getByRole('button', { name: point.name, exact: true })
    .click();
  await page.getByRole('button', { name: 'Edytuj punkt', exact: true }).click();
  await page.getByLabel('Nazwa punktu').fill('Szopa po korekcie');
  await page.getByLabel('Szerokość geograficzna').fill('51.75');
  await page.getByLabel('Miejsce ucieczki', { exact: true }).check();
  await savePoint(page);
  const saved = await exportCase(page);
  expect(saved.points[1]).toMatchObject({
    id: point.id,
    entries: point.entries,
    photos: point.photos,
    coordinates: { latitude: 51.75, longitude: point.coordinates.longitude },
  });
  expect(saved.case.escape.escapePointId).toBe(point.id);
  await page.reload();
  await expect(
    page
      .getByRole('complementary', { name: 'Miejsca', exact: true })
      .getByRole('button', { name: 'Szopa po korekcie', exact: true }),
  ).toBeVisible();
  await importCase(page, saved);
  await page
    .getByRole('complementary', { name: 'Miejsca', exact: true })
    .getByRole('button', { name: 'Szopa po korekcie', exact: true })
    .click();
  await page.getByRole('button', { name: 'Usuń punkt', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('historii: 7');
  await page.getByRole('button', { name: 'Anuluj usunięcie' }).click();
  expect((await exportCase(page)).points).toEqual(saved.points);
  await page.getByRole('button', { name: 'Usuń punkt', exact: true }).click();
  await page.getByRole('button', { name: 'Potwierdź usunięcie' }).click();
  const deleted = await exportCase(page);
  expect(deleted.case.escape.escapePointId).toBeNull();
  expect(deleted.points).toHaveLength(1);
  expect(deleted.areas[0].checks[0]).toMatchObject({
    observationEntryId: null,
    result: 'other_or_inconclusive',
  });
  expect(deleted.assets).toEqual(saved.assets);
});

test('selects overlapping places by name and protects dirty point/profile transitions', async ({
  page,
}) => {
  const file = structuredClone(completeFile);
  file.points[1].coordinates = file.points[0].coordinates;
  file.mapView = { center: file.points[0].coordinates, zoom: 15, basemap: 'osm' };
  await importCase(page, file);
  await page.locator('.leaflet-marker-icon[title]').last().click();
  const overlap = page.getByRole('region', { name: 'Nakładające się punkty' });
  await expect(overlap).toBeVisible();
  await overlap.getByRole('button', { name: file.points[0].name, exact: true }).click();
  await expect(page.getByRole('region', { name: 'Wybrane miejsce' })).toContainText(
    file.points[0].name,
  );
  await page.getByRole('button', { name: 'Edytuj punkt', exact: true }).click();
  await page.getByLabel('Nazwa punktu').fill('Brudny szkic');
  await page.getByRole('button', { name: 'Edytuj profil', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Niezatwierdzony punkt' })).toBeVisible();
  await page.getByRole('button', { name: 'Zostań przy edycji' }).click();
  await expect(page.getByLabel('Nazwa punktu')).toHaveValue('Brudny szkic');
  await page.getByRole('button', { name: 'Edytuj profil', exact: true }).click();
  await page.getByRole('button', { name: 'Zapisz i kontynuuj' }).click();
  await expect(page.getByRole('heading', { name: 'Profil zwierzęcia' })).toBeVisible();
  expect((await exportCase(page)).points[0].name).toBe('Brudny szkic');
});

test('protects a point draft during case replacement and switching point editors', async ({
  page,
}) => {
  await importCase(page, completeFile);
  const places = page.getByRole('complementary', { name: 'Miejsca', exact: true });
  await places.getByRole('button', { name: completeFile.points[1].name, exact: true }).click();
  await page.getByRole('button', { name: 'Edytuj punkt', exact: true }).click();
  await page.getByLabel('Nazwa punktu').fill('Zachowaj szkic');
  await page.getByRole('button', { name: 'Nowa sprawa', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Niezatwierdzony punkt' })).toBeVisible();
  await page.getByRole('button', { name: 'Zostań przy edycji' }).click();
  await expect(page.getByLabel('Nazwa punktu')).toHaveValue('Zachowaj szkic');
  expect((await exportCase(page)).points).toEqual(completeFile.points);
  await places.getByRole('button', { name: 'Dom', exact: true }).click();
  await page.getByRole('button', { name: 'Edytuj punkt', exact: true }).click();
  await page.getByRole('button', { name: 'Odrzuć szkic' }).click();
  await expect(page.getByLabel('Nazwa punktu')).toHaveValue('Dom');
  await page.screenshot({ path: resolve(__dirname, '../../../.scratch/f07-desktop.png') });
  await page.getByRole('button', { name: 'Anuluj punkt', exact: true }).click();
  expect((await exportCase(page)).points).toEqual(completeFile.points);
});

test('starts with a collapsed place list on a phone and keeps the canvas full size', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const map = page.getByRole('region', { name: 'Mapa poszukiwań' });
  const before = await map.boundingBox();
  await expect(page.getByRole('button', { name: 'Rozwiń miejsca', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dodaj punkt', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Rozwiń miejsca', exact: true }).click();
  expect(await map.boundingBox()).toEqual(before);
  await page.getByRole('button', { name: 'Dodaj punkt', exact: true }).click();
  await page.getByLabel('Nazwa punktu').fill('Telefon');
  await page.getByLabel('Szerokość geograficzna').fill('52');
  await page.getByLabel('Długość geograficzna').fill('21');
  await page.screenshot({ path: resolve(__dirname, '../../../.scratch/f07-mobile.png') });
  await savePoint(page);
  await expect(page.getByLabel('Nazwa punktu')).toBeHidden();
  expect((await exportCase(page)).points[0]).toMatchObject({
    name: 'Telefon',
    coordinates: { latitude: 52, longitude: 21 },
    roles: [],
  });
});
