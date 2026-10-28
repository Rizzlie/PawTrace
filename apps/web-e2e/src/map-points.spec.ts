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

async function selectListedPoint(page: Page, name: string) {
  const expand = page.getByRole('button', { name: 'Rozwiń miejsca', exact: true });
  if (await expand.isVisible()) await expand.click();
  await page
    .getByRole('complementary', { name: 'Miejsca', exact: true })
    .getByRole('button', { name, exact: true })
    .click();
}

async function collapsePlaces(page: Page) {
  const collapse = page.getByRole('button', { name: 'Zwiń miejsca', exact: true });
  if (await collapse.isVisible()) await collapse.click();
  await expect(page.locator('#place-list')).toBeHidden();
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
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano w przeglądarce');
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
  const actions = page.getByRole('toolbar', { name: 'Działania na mapie' });
  await expect(actions.getByRole('button', { name: 'Moja lokalizacja' })).toBeVisible();
  await actions.getByRole('button', { name: 'Dodaj punkt', exact: true }).click();
  await map.click({ position: { x: 560, y: 300 } });
  const latitude = page.getByLabel('Szerokość geograficzna');
  await expect(latitude).not.toHaveValue('');
  const before = await latitude.inputValue();
  const marker = page.locator('.leaflet-marker-icon[title="Położenie szkicu"]');
  await expect(marker).toHaveText('1');
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
  await collapsePlaces(page);
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
  await page.getByRole('button', { name: 'Odrzuć szkic' }).click();
  await page.getByRole('button', { name: 'Edytuj punkt', exact: true }).click();
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
  const actions = page.getByRole('toolbar', { name: 'Działania na mapie' });
  const add = actions.getByRole('button', { name: 'Dodaj punkt', exact: true });
  await expect(add).toBeVisible();
  await expect(actions.getByRole('button', { name: 'Moja lokalizacja' })).toBeVisible();
  await expect(
    page
      .getByRole('complementary', { name: 'Miejsca', exact: true })
      .getByRole('button', { name: 'Dodaj punkt', exact: true }),
  ).toHaveCount(0);
  await actions.getByRole('button', { name: 'Moja lokalizacja' }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(add).toBeFocused();
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

for (const { width, inset } of [
  { width: 1280, inset: 16 },
  { width: 390, inset: 12 },
]) {
  test(`opens selected-place details independently at the bottom right at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.reload();
    await importCase(page, completeFile);
    const map = page.getByRole('region', { name: 'Mapa poszukiwań' });
    const canvas = await markerBox(map);
    await selectListedPoint(page, completeFile.points[1].name);
    const details = page.getByRole('complementary', { name: 'Szczegóły miejsca', exact: true });
    await expect(details).toContainText(completeFile.points[1].name);
    await expect(
      page
        .getByRole('complementary', { name: 'Miejsca', exact: true })
        .getByRole('region', { name: 'Wybrane miejsce' }),
    ).toHaveCount(0);
    const panel = await markerBox(details);
    expect(panel.x + panel.width).toBeCloseTo(canvas.x + canvas.width - inset, 0);
    expect(panel.y + panel.height).toBeCloseTo(canvas.y + canvas.height - 80, 0);
    await collapsePlaces(page);
    await expect(details).toBeVisible();
    const list = await markerBox(page.getByRole('complementary', { name: 'Miejsca', exact: true }));
    expect(list.y + list.height).toBeLessThanOrEqual(panel.y);
    expect(await map.boundingBox()).toEqual(canvas);
    await page.screenshot({
      path: resolve(__dirname, `../../../.scratch/f07-details-${width}.png`),
    });
    await details.getByRole('button', { name: 'Zamknij szczegóły miejsca' }).click();
    await expect(details).toBeHidden();
    await selectListedPoint(page, completeFile.points[0].name);
    await expect(details).toContainText(completeFile.points[0].name);
  });
}

test('matches place-list numbers to markers and renumbers surviving places after removal', async ({
  page,
}) => {
  await importCase(page, completeFile);
  const places = page.getByRole('complementary', { name: 'Miejsca', exact: true });
  const home = places.getByRole('button', { name: completeFile.points[0].name, exact: true });
  const shed = places.getByRole('button', { name: completeFile.points[1].name, exact: true });
  await expect(home.locator('.point-number')).toHaveText('1');
  await expect(shed.locator('.point-number')).toHaveText('2');
  await expect(page.locator('.leaflet-marker-icon[title="Dom"]')).toHaveText('1');
  const shedMarker = page.locator('.leaflet-marker-icon[title="Szopa przy parku"]');
  await expect(shedMarker).toHaveText('2');
  await home.click();
  await page.getByRole('button', { name: 'Usuń punkt', exact: true }).click();
  await page.getByRole('button', { name: 'Potwierdź usunięcie', exact: true }).click();
  await expect(shed.locator('.point-number')).toHaveText('1');
  await expect(shedMarker).toHaveText('1');
  expect((await exportCase(page)).points).toEqual(completeFile.points.slice(1));
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano w przeglądarce');
  await page.reload();
  await expect(shed.locator('.point-number')).toHaveText('1');
  await expect(shedMarker).toHaveText('1');
});

test('zooms closer to 22, reuses supported tiles and restores the view after reload', async ({
  page,
}) => {
  const levels: number[] = [];
  await page.route('https://tile.openstreetmap.org/**', (route) => {
    levels.push(Number(new URL(route.request().url()).pathname.split('/')[1]));
    return route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"/>',
    });
  });
  const file = structuredClone(completeFile);
  file.mapView = { center: { latitude: 52.23, longitude: 21.01 }, zoom: 19, basemap: 'osm' };
  await importCase(page, file);
  await expect(page.locator('img.leaflet-tile-loaded[src*="/19/"]').first()).toBeVisible();
  const scale = page.locator('.leaflet-control-scale-line');
  for (const level of [20, 21, 22]) {
    const previous = await scale.textContent();
    await page.getByRole('button', { name: 'Przybliż', exact: true }).click();
    await expect(scale).not.toHaveText(previous ?? '');
    await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano w przeglądarce');
    expect((await exportCase(page)).mapView.zoom).toBe(level);
  }
  await expect(page.getByRole('button', { name: 'Przybliż', exact: true })).toHaveClass(
    /leaflet-disabled/,
  );
  expect(levels.length).toBeGreaterThan(0);
  expect(Math.max(...levels)).toBeLessThanOrEqual(19);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Przybliż', exact: true })).toHaveClass(
    /leaflet-disabled/,
  );
  expect((await exportCase(page)).mapView.zoom).toBe(22);
});
