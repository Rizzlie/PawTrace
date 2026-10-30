import { test, createCase } from './fixtures';
import { expect, type Page } from '@playwright/test';
import { caseFileSchema } from '@pawtrace/case-domain';
import completeFile from '@pawtrace/case-domain/fixtures/complete-case-v1.json';
import { resolve } from 'node:path';

async function exportCase(page: Page) {
  await page.getByRole('button', { name: 'Plik JSON', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Eksportuj JSON', exact: true }).click();
  const stream = await (await download).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const { exportedAt, ...document } = caseFileSchema.parse(
    JSON.parse(Buffer.concat(chunks).toString()),
  );
  void exportedAt;
  return document;
}

async function expandPlaces(page: Page) {
  const toggle = page.getByRole('button', { name: /^(Rozwiń|Zwiń) miejsca$/ });
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
}

const imported = { ...completeFile, mapView: { ...completeFile.mapView, basemap: 'osm' } };

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
  await createCase(page);
  await page.getByLabel('Importuj plik JSON').setInputFiles({
    name: 'filters.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(imported)),
  });
  await page.getByRole('button', { name: 'Zastąp sprawę', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Zastąpienie sprawy' })).toBeHidden();
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
  await expandPlaces(page);
});

for (const width of [1280, 390]) {
  test(`filters places and counts by period while keeping full highlighted history and complete export at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const before = await exportCase(page);
    const places = page.getByRole('complementary', { name: 'Miejsca', exact: true });
    const list = places.locator('mat-action-list[aria-label="Lista miejsc"]');
    const shed = page.locator('.leaflet-marker-icon[title="Szopa przy parku"]');
    const home = page.locator('.leaflet-marker-icon[title="Dom"]');
    await expect(shed).toHaveAttribute('aria-description', /Szukane: 1 · Niepewne: 1 · Inne: 1/);

    await places.getByRole('button', { name: 'Zwiń miejsca', exact: true }).click();
    await places.getByRole('button', { name: 'Filtry', exact: true }).click();
    await expect(places.getByRole('button', { name: 'Zwiń miejsca', exact: true })).toBeVisible();
    const filters = page.getByRole('form', { name: 'Filtry miejsc' });
    await expect(filters.getByLabel('Uwzględnij wpisy o nieznanym czasie')).toBeDisabled();
    await filters.getByLabel('Od dnia').fill('2026-10-16');
    await expect(places.getByRole('button', { name: 'Filtry (aktywne)' })).toBeVisible();
    await expect(places.getByRole('status')).toHaveText('Widoczne miejsca: 1 z 2.');
    await expect(list.locator('button')).toHaveCount(1);
    await expect(home).toHaveCount(0);
    await expect(shed).toHaveAttribute('aria-description', /Szukane: 0 · Niepewne: 0 · Inne: 1/);
    await expect(shed).toHaveAttribute('data-observation-tones', '#6e6098');

    await list.getByRole('button', { name: /Szopa przy parku/ }).click();
    const summary = page.getByLabel('Podsumowanie obserwacji', { exact: true });
    await expect(summary).toHaveText(/Szukane: 0 · Niepewne: 0 · Inne: 1/);
    const old = page.getByRole('article', {
      name: 'Biała końcówka ogona, rozpoznana przez opiekuna.',
    });
    const different = page.getByRole('article', { name: 'Czarny kot sąsiada.' });
    await expect(old).toBeVisible();
    await expect(old).not.toContainText('Pasuje do filtrów');
    await expect(old).toContainText('Szukane zwierzę');
    await expect(different).toContainText('Pasuje do filtrów');
    await expect(different).toHaveAttribute('data-identification', 'different_animal');
    await expect(page.getByRole('article', { name: 'Nagranie z archiwum.' })).toHaveCount(0);
    await expect(page.getByText('Ukryte odrzucone relacje: 1', { exact: true })).toBeVisible();

    await expandPlaces(page);
    await filters.getByLabel('Uwzględnij wpisy o nieznanym czasie').check();
    await page.getByRole('button', { name: 'Pokaż odrzucone relacje', exact: true }).click();
    await expect(filters.getByLabel('Pokaż ręcznie odrzucone relacje')).toBeChecked();
    await expect(summary).toHaveText(/Szukane: 1 · Niepewne: 0 · Inne: 1/);
    await expect(page.getByRole('article', { name: 'Nagranie z archiwum.' })).toContainText(
      'Pasuje do filtrów',
    );
    if (width === 1280)
      await page.screenshot({ path: resolve('../../.scratch/f14-filters-1280.png') });

    await filters.getByLabel('Od dnia').fill('2026-12-01');
    await expect(list.locator('button')).toHaveCount(1);
    await filters.getByLabel('Uwzględnij wpisy o nieznanym czasie').uncheck();
    await filters.getByLabel('Do dnia').fill('2026-11-01');
    await expect(filters.getByRole('alert')).toContainText('późniejsza niż końcowa');
    await expect(places.getByText('Żadne miejsce nie pasuje do filtrów.')).toBeVisible();
    await expect(page.locator('.leaflet-marker-icon[title]')).toHaveCount(0);
    await expect(summary).toHaveText(/Szukane: 0 · Niepewne: 0 · Inne: 0/);
    expect(await exportCase(page)).toEqual(before);

    const reset = places.getByRole('button', { name: 'Wyczyść filtry' }).first();
    await reset.focus();
    await page.keyboard.press('Enter');
    await expect(list.locator('button')).toHaveCount(2);
    await expect(filters.getByLabel('Od dnia')).toHaveValue('');

    await filters.getByLabel('Miejsce ucieczki').check();
    await expect(list.locator('button')).toHaveCount(1);
    await expect(home).toHaveCount(1);
    await filters.getByLabel('Miejsce ucieczki').uncheck();
    await filters.getByLabel('Notatka').check();
    await expect(list.getByRole('button', { name: /Szopa przy parku/ })).toBeVisible();
    await expect(home).toHaveCount(0);
    expect(await exportCase(page)).toEqual(before);
    await page.reload();
    await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
    expect(await exportCase(page)).toEqual(before);
  });
}
