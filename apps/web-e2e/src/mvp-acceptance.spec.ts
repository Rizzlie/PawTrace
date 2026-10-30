import { test, createCase, photosUrl, uploadedPhoto } from './fixtures';
import { expect, type BrowserContext, type Page } from '@playwright/test';
import { caseFileSchema, type CaseFile } from '@pawtrace/case-domain';
import completeFile from '@pawtrace/case-domain/fixtures/complete-case-v1.json';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// F15: one cross-feature flow from an empty case, driven only through the UI against the real API.
// External providers (tiles, map configuration, geocoder) receive controlled responses.
test.use({ timezoneId: 'Europe/Warsaw' });

const address = { id: 'node:1', label: 'Ogrodowa 1, Warszawa', latitude: 52.23, longitude: 21.01 };

async function controlProviders(context: BrowserContext) {
  await context.route('**/api/map-config', (route) =>
    route.fulfill({ json: { mapboxToken: 'pk.controlled-test' } }),
  );
  for (const [url, size] of [
    ['https://tile.openstreetmap.org/**', 256],
    ['https://api.mapbox.com/**', 512],
  ] as const)
    await context.route(url, (route) =>
      route.fulfill({
        contentType: 'image/svg+xml',
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"/>`,
      }),
    );
  await context.route('**/api/address-search?*', (route) =>
    route.fulfill({
      json: {
        results: [address],
        attribution: { label: 'Kontrolowany geokoder', url: 'https://example.com' },
      },
    }),
  );
}

async function exportCase(page: Page) {
  await page.getByRole('button', { name: 'Plik JSON', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Eksportuj JSON', exact: true }).click();
  const stream = await (await download).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return caseFileSchema.parse(JSON.parse(Buffer.concat(chunks).toString()));
}

function withoutExportTime({ exportedAt, ...document }: CaseFile) {
  void exportedAt;
  return document;
}

async function replaceCase(page: Page, file: unknown) {
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
  await page.getByLabel('Importuj plik JSON').setInputFiles({
    name: 'acceptance.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  });
  await page.getByRole('button', { name: 'Zastąp sprawę', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Zastąpienie sprawy' })).toBeHidden();
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
  await expect(page.getByRole('dialog')).toBeHidden();
}

async function selectPlace(page: Page, name: string) {
  const toggle = page.getByRole('button', { name: /^(Rozwiń|Zwiń) miejsca$/ });
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
  await page
    .getByRole('complementary', { name: 'Miejsca', exact: true })
    .getByRole('button', { name, exact: true })
    .click();
}

async function addEntry(page: Page, type: string, description: string) {
  await page.getByRole('button', { name: 'Dodaj wpis', exact: true }).click();
  await page.getByRole('combobox', { name: 'Typ wpisu', exact: true }).selectOption(type);
  await page.getByLabel('Opis wpisu', { exact: true }).fill(description);
}

async function addObservation(
  page: Page,
  description: string,
  identification: string,
  date: string,
) {
  await addEntry(page, 'observation', description);
  await page.getByLabel('Identyfikacja zwierzęcia').selectOption(identification);
  await page.getByLabel('Dokładność czasu').selectOption('date');
  await page.getByLabel('Data zdarzenia', { exact: true }).fill(date);
}

async function saveEntry(page: Page) {
  await page.getByRole('button', { name: 'Zapisz wpis', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Zapisz wpis', exact: true })).toBeHidden();
}

test('completes the desktop MVP flow from an empty case through photos, filters, reload and JSON transfer', async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  page.on('pageerror', (error) => {
    throw error;
  });
  await controlProviders(context);
  await createCase(page);
  const map = page.getByRole('region', { name: 'Mapa poszukiwań' });

  // An incomplete profile is enough; the rest can be completed later.
  await page.getByRole('button', { name: 'Edytuj profil', exact: true }).click();
  await page.getByLabel('Imię', { exact: true }).fill('Luna');
  await page.getByRole('button', { name: 'Zapisz profil', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Sprawa' })).toContainText('Luna');

  // Escape location positioned by a submitted address search.
  await page.getByRole('button', { name: 'Dodaj punkt', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Adres w Polsce' }).fill('Ogrodowa 1');
  await page.getByRole('button', { name: 'Szukaj', exact: true }).click();
  await page.getByRole('button', { name: address.label, exact: true }).click();
  await expect(page.getByLabel('Szerokość geograficzna')).toHaveValue('52.23');
  await page.getByLabel('Nazwa punktu').fill('Dom');
  await page.getByLabel('Miejsce ucieczki', { exact: true }).check();
  await page.getByRole('button', { name: 'Zapisz punkt', exact: true }).click();
  await expect(page.getByLabel('Nazwa punktu')).toBeHidden();

  // A second place positioned on the map; a point needs a name before saving.
  await page.getByRole('button', { name: 'Dodaj punkt', exact: true }).click();
  await map.click({ position: { x: 700, y: 320 } });
  await page.getByRole('button', { name: 'Zapisz punkt', exact: true }).click();
  await expect(page.getByLabel('Nazwa punktu')).toBeVisible();
  await page.getByLabel('Nazwa punktu').fill('Szopa');
  await page.getByLabel('Potencjalna kryjówka', { exact: true }).check();
  await page.getByRole('button', { name: 'Zapisz punkt', exact: true }).click();
  await expect(page.getByLabel('Nazwa punktu')).toBeHidden();

  // Three identification outcomes, a rejected report, other entry types and a real photo upload.
  await selectPlace(page, 'Szopa');
  await addObservation(page, 'Luna na dachu szopy', 'target_animal', '2026-10-10');
  const bytes = await readFile(resolve('src/fixtures/photo-detail.png'));
  const uploaded = page.waitForResponse(uploadedPhoto);
  await page
    .getByLabel('Dodaj zdjęcia', { exact: true })
    .setInputFiles({ name: 'luna-na-dachu.png', mimeType: 'image/png', buffer: bytes });
  const { filename } = (await (await uploaded).json()) as { filename: string };
  await expect(
    page.getByRole('button', { name: `Otwórz zdjęcie ${filename}`, exact: true }),
  ).toBeVisible();
  await saveEntry(page);
  await addObservation(page, 'Może Luna przy płocie', 'uncertain', '2026-10-20');
  await saveEntry(page);
  await addObservation(page, 'Rudy kot sąsiada', 'different_animal', '2026-10-21');
  await saveEntry(page);
  await addObservation(page, 'Relacja z innego miasta', 'target_animal', '2026-10-22');
  await page.getByLabel('Ręcznie odrzucona relacja').check();
  await page.getByLabel('Powód odrzucenia').fill('Inne miasto');
  await saveEntry(page);
  await addEntry(page, 'action', 'Wyłożono karmę');
  await page.getByLabel('Rodzaj działania').selectOption('food_placement');
  await saveEntry(page);
  await addEntry(page, 'note', 'Notatka do usunięcia');
  await saveEntry(page);
  await page
    .getByRole('article', { name: 'Notatka do usunięcia', exact: true })
    .getByRole('button', { name: 'Usuń wpis', exact: true })
    .click();
  await page.getByRole('button', { name: 'Potwierdź usunięcie wpisu', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Notatka do usunięcia' })).toHaveCount(0);
  const marker = page.locator('.leaflet-marker-icon[title="Szopa"]');
  await expect(marker).toHaveAttribute('aria-description', /Szukane: 1 · Niepewne: 1 · Inne: 1/);
  await expect(
    page.getByRole('article', { name: 'Rudy kot sąsiada', exact: true }),
  ).toHaveAttribute('data-identification', 'different_animal');

  // Both basemaps with attribution; the viewport and case stay intact.
  await page.getByRole('radio', { name: 'Satelita', exact: true }).click();
  await expect(
    page.locator('img.leaflet-tile-loaded[src*="api.mapbox.com"]').first(),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Mapbox', exact: true })).toBeVisible();
  await page.getByRole('radio', { name: 'Mapa OSM', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Improve this map' })).toHaveCount(0);

  // A planned circle with a whole and a partial check, plus a polygon plan.
  await page.getByRole('button', { name: 'Rysuj koło', exact: true }).click();
  await page.getByLabel('Nazwa obszaru', { exact: true }).fill('Zagajnik');
  await map.click({ position: { x: 600, y: 420 } });
  await page.getByLabel('Promień (m)', { exact: true }).fill('120');
  await page.getByRole('button', { name: 'Zapisz obszar', exact: true }).click();
  await expect(page.getByLabel('Nazwa obszaru', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Zagajnik', exact: true }).click();
  await page.getByRole('button', { name: 'Dodaj przeszukanie', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Wynik kontroli', exact: true })
    .selectOption('no_animal_or_signs');
  await page.getByLabel('Opis przeszukania', { exact: true }).fill('Cały zagajnik');
  await page.getByRole('button', { name: 'Zapisz przeszukanie', exact: true }).click();
  await page.getByRole('button', { name: 'Dodaj przeszukanie', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Zasięg przeszukania', exact: true })
    .selectOption('custom');
  await page.getByLabel('Promień (m)', { exact: true }).fill('40');
  await page.getByLabel('Opis przeszukania', { exact: true }).fill('Tylko skraj zagajnika');
  await page.getByRole('button', { name: 'Zapisz przeszukanie', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Historia przeszukań (2)', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Rysuj wielokąt', exact: true }).click();
  await page.getByLabel('Nazwa obszaru', { exact: true }).fill('Działki');
  for (const position of [
    { x: 460, y: 200 },
    { x: 580, y: 200 },
    { x: 520, y: 280 },
  ])
    await map.click({ position });
  await page.getByRole('button', { name: 'Zapisz obszar', exact: true }).click();
  await expect(page.getByLabel('Nazwa obszaru', { exact: true })).toBeHidden();

  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
  const created = await exportCase(page);
  const [home, shed] = created.points;
  expect(created.animal?.name).toBe('Luna');
  expect(created.case.escape.escapePointId).toBe(home.id);
  expect(home).toMatchObject({
    name: 'Dom',
    coordinates: { latitude: 52.23, longitude: 21.01 },
    roles: [],
  });
  expect(shed.roles).toEqual(['potential_hiding_place']);
  expect(shed.entries.map((entry) => entry.type)).toEqual([
    'observation',
    'observation',
    'observation',
    'observation',
    'action',
  ]);
  expect(
    shed.entries.map((entry) =>
      entry.type === 'observation' ? [entry.identification, entry.status] : entry.type,
    ),
  ).toEqual([
    ['target_animal', 'active'],
    ['uncertain', 'active'],
    ['different_animal', 'active'],
    ['target_animal', 'rejected'],
    'action',
  ]);
  expect(shed.entries[0]).toMatchObject({
    photos: [filename],
    occurredAt: { kind: 'date', date: '2026-10-10' },
  });
  expect(created.assets).toEqual([
    expect.objectContaining({ filename, originalName: 'luna-na-dachu.png' }),
  ]);
  const [circle, polygon] = created.areas;
  expect(circle.plannedGeometry).toMatchObject({ type: 'circle', radiusMeters: 120 });
  expect(circle.checks.map((check) => check.actualGeometry)).toEqual([
    circle.plannedGeometry,
    expect.objectContaining({ type: 'circle', radiusMeters: 40 }),
  ]);
  expect(polygon.plannedGeometry).toMatchObject({ type: 'polygon' });
  expect(created.mapView.basemap).toBe('osm');
  expect(await (await page.request.get(photosUrl(page) + '/' + filename)).body()).toEqual(bytes);

  // Filters change counts and highlights, never the exported document.
  await selectPlace(page, 'Szopa');
  await page.getByRole('button', { name: 'Filtry', exact: true }).click();
  await page.getByRole('form', { name: 'Filtry miejsc' }).getByLabel('Od dnia').fill('2026-10-15');
  await expect(marker).toHaveAttribute('aria-description', /Szukane: 0 · Niepewne: 1 · Inne: 1/);
  await expect(page.getByLabel('Podsumowanie obserwacji', { exact: true })).toHaveText(
    /Szukane: 0 · Niepewne: 1 · Inne: 1/,
  );
  await expect(
    page.getByRole('article', { name: 'Luna na dachu szopy', exact: true }),
  ).not.toContainText('Pasuje do filtrów');
  await expect(page.getByRole('article', { name: 'Rudy kot sąsiada', exact: true })).toContainText(
    'Pasuje do filtrów',
  );
  await expect(page.getByText('Ukryte odrzucone relacje: 1', { exact: true })).toBeVisible();
  const filtered = await exportCase(page);
  expect(withoutExportTime(filtered)).toEqual(withoutExportTime(created));

  // Browser restoration, then a full replacement round-trip through the exported file.
  await page.reload();
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
  expect(withoutExportTime(await exportCase(page))).toEqual(withoutExportTime(created));
  await replaceCase(page, {
    ...filtered,
    case: { ...filtered.case, escape: { ...filtered.case.escape, escapePointId: null } },
    points: [],
    areas: [],
  });
  expect((await exportCase(page)).points).toEqual([]);
  await replaceCase(page, filtered);
  expect(withoutExportTime(await exportCase(page))).toEqual(withoutExportTime(created));
  await selectPlace(page, 'Szopa');
  const observation = page.getByRole('article', { name: 'Luna na dachu szopy', exact: true });
  await expect(
    observation.getByRole('button', { name: `Otwórz zdjęcie ${filename}`, exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: resolve('../../.scratch/f15-acceptance-1280.png') });
});

test('keeps the restored case usable and exportable while every external provider and photo is unavailable', async ({
  page,
  context,
}) => {
  page.on('pageerror', (error) => {
    throw error;
  });
  await controlProviders(context);
  await createCase(page);
  await replaceCase(page, completeFile);
  // Page routes take precedence over the controlled context responses.
  await page.route('**/api/map-config', (route) =>
    route.fulfill({ status: 503, body: 'Unavailable' }),
  );
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({ status: 503, body: 'Unavailable' }),
  );
  await page.route('**/api/address-search?*', (route) =>
    route.fulfill({ status: 503, json: { message: 'Provider unavailable' } }),
  );
  await page.route('**/api/cases/*/assets/**', (route) =>
    route.fulfill({ status: 404, json: { message: 'Zdjęcie niedostępne' } }),
  );
  await page.reload();
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
  await expect(page.getByText('Nie udało się pobrać mapy OSM.', { exact: false })).toBeVisible();
  await expect(
    page.getByText('Nie udało się pobrać konfiguracji satelity.', { exact: false }),
  ).toBeVisible();
  const restored = await exportCase(page);
  // The open server case keeps its identity; every imported field is preserved.
  restored.case.id = completeFile.case.id;
  expect(withoutExportTime(restored)).toEqual(
    withoutExportTime(caseFileSchema.parse(completeFile)),
  );

  await page.getByRole('button', { name: 'Dodaj punkt', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Adres w Polsce' }).fill('Warszawa');
  await page.getByRole('button', { name: 'Szukaj', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Nie udało się wyszukać adresu');
  await page
    .getByRole('region', { name: 'Mapa poszukiwań' })
    .click({ position: { x: 640, y: 380 } });
  await page.getByLabel('Nazwa punktu').fill('Ustawione ręcznie');
  await page.getByRole('button', { name: 'Zapisz punkt', exact: true }).click();
  await expect(page.getByLabel('Nazwa punktu')).toBeHidden();

  await page.getByRole('button', { name: 'Edytuj profil', exact: true }).click();
  await expect(
    page
      .getByRole('article', { name: 'Zdjęcie unavailable-original.jpg', exact: true })
      .getByText('Zdjęcie niedostępne.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Anuluj edycję', exact: true }).click();

  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
  const changed = await exportCase(page);
  expect(changed.points.map((point) => point.name)).toEqual([
    ...completeFile.points.map((point) => point.name),
    'Ustawione ręcznie',
  ]);
  expect(changed.points.slice(0, -1)).toEqual(restored.points);
  expect(changed.assets).toEqual(restored.assets);
  expect(changed.animal).toEqual(restored.animal);
  await page.reload();
  expect(withoutExportTime(await exportCase(page))).toEqual(withoutExportTime(changed));
});
