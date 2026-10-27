import { test } from './fixtures';
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
  return caseFileSchema.parse(JSON.parse(Buffer.concat(chunks).toString()));
}
async function selectHome(page: Page) {
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano w przeglądarce');
  const toggle = page.getByRole('button', { name: /^(Rozwiń|Zwiń) miejsca$/ });
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
  await page
    .getByRole('complementary', { name: 'Miejsca', exact: true })
    .getByRole('button', { name: 'Dom', exact: true })
    .click();
}
async function addEntry(page: Page, type: string, description: string) {
  await page.getByRole('button', { name: 'Dodaj wpis', exact: true }).click();
  await page.getByRole('combobox', { name: 'Typ wpisu', exact: true }).selectOption(type);
  await page.getByLabel('Opis wpisu', { exact: true }).fill(description);
}
async function saveEntry(page: Page) {
  await page.getByRole('button', { name: 'Zapisz wpis', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Zapisz wpis', exact: true })).toBeHidden();
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
  await page.getByLabel('Importuj plik JSON').setInputFiles({
    name: 'history.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ ...completeFile, mapView: { ...completeFile.mapView, basemap: 'osm' } }),
    ),
  });
  await page.getByRole('button', { name: 'Zastąp sprawę', exact: true }).click();
  await selectHome(page);
});

test('records sighting, food placement, food present and food gone; reloads and transfers the full history', async ({
  page,
}) => {
  await addEntry(page, 'observation', 'Luna przy domu');
  await page.getByLabel('Identyfikacja zwierzęcia').selectOption('target_animal');
  await page
    .getByRole('combobox', { name: 'Źródło obserwacji', exact: true })
    .selectOption('another_person');
  await page.getByLabel('Opis źródła').fill('Sąsiad');
  await page.getByLabel('Dokładność czasu').selectOption('date');
  await page.getByLabel('Data zdarzenia', { exact: true }).fill('2026-10-20');
  await saveEntry(page);
  await addEntry(page, 'action', 'Wyłożono karmę');
  await page.getByLabel('Rodzaj działania').selectOption('food_placement');
  await page.getByLabel('Rodzaj karmy').fill('Mokra karma');
  await page.getByLabel('Ilość karmy').fill('85');
  await saveEntry(page);
  await addEntry(page, 'check', 'Karma nadal w misce');
  await page.getByLabel('Stan karmy').selectOption('present');
  await saveEntry(page);
  await addEntry(page, 'check', 'Pusta miska');
  await page.getByLabel('Stan karmy').selectOption('absent');
  await saveEntry(page);
  const saved = await exportCase(page);
  expect(saved.points[0].entries.map((e) => e.type)).toEqual([
    'observation',
    'action',
    'check',
    'check',
  ]);
  expect(saved.points[0].entries[3]).toMatchObject({
    details: { foodStatus: 'absent' },
    result: null,
  });
  await expect(page.getByLabel('Podsumowanie obserwacji', { exact: true })).toContainText(
    'Szukane: 1',
  );
  await expect(page.getByRole('heading', { name: 'Nieznany czas', exact: true })).toBeVisible();
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano w przeglądarce');
  await page.reload();
  await selectHome(page);
  expect((await exportCase(page)).points).toEqual(saved.points);
  await page.getByLabel('Importuj plik JSON').setInputFiles({
    name: 'roundtrip.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await page.getByRole('button', { name: 'Zastąp sprawę', exact: true }).click();
  expect((await exportCase(page)).points).toEqual(saved.points);
});

test('keeps different-animal sightings visible, distinguishes mixed outcomes and protects dirty editor transitions', async ({
  page,
}) => {
  const places = page.getByRole('complementary', { name: 'Miejsca', exact: true });
  await places.getByRole('button', { name: 'Szopa przy parku', exact: true }).click();
  const marker = page.locator('.leaflet-marker-icon[title="Szopa przy parku"]');
  await expect(marker).toHaveAttribute('data-observation-tones', '#347247,#a77717,#6e6098');
  await expect(marker).toHaveAttribute('aria-description', /Szukane: 2.*Niepewne: 1.*Inne: 1/);
  await page
    .getByRole('article', { name: 'Czarny kot sąsiada.', exact: true })
    .getByRole('button', { name: 'Edytuj wpis', exact: true })
    .click();
  await expect(page.getByLabel('Ręcznie odrzucona relacja')).not.toBeChecked();
  await page.getByLabel('Opis wpisu', { exact: true }).fill('Nie zapisuj');
  await places.getByRole('button', { name: 'Dom', exact: true }).click();
  await page.getByRole('button', { name: 'Zostań przy edycji', exact: true }).click();
  await expect(page.getByLabel('Opis wpisu', { exact: true })).toHaveValue('Nie zapisuj');
  await page.getByRole('button', { name: 'Anuluj wpis', exact: true }).click();
  expect((await exportCase(page)).points[1].entries[2].description).toBe('Czarny kot sąsiada.');
  await page
    .getByRole('article', { name: 'Kot widziany z daleka.', exact: true })
    .getByRole('button', { name: 'Usuń wpis', exact: true })
    .click();
  await page.getByRole('button', { name: 'Potwierdź usunięcie wpisu', exact: true }).click();
  const saved = await exportCase(page);
  expect(saved.areas[0].checks[0]).toMatchObject({
    result: 'other_or_inconclusive',
    observationEntryId: null,
  });
  expect(saved.assets).toEqual(completeFile.assets);
  await expect(marker).toHaveAttribute('data-observation-tones', '#347247,#6e6098');
});

for (const width of [1280, 390]) {
  test(`edits identification independently, resolves repeated hours and stays usable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.reload();
    await selectHome(page);
    await addEntry(page, 'observation', 'Wieczorna relacja');
    await page.getByLabel('Dokładność czasu').selectOption('approximate');
    await page.getByLabel('Chwila zdarzenia', { exact: true }).fill('2026-10-25T02:30');
    const choice = page.getByRole('combobox', {
      name: 'Chwila zdarzenia — wystąpienie godziny',
      exact: true,
    });
    await choice.selectOption({ label: 'Drugie (UTC+01:00)' });
    await page.getByLabel('Oryginalny opis czasu').fill('Mniej więcej o wpół do trzeciej');
    await page.getByLabel('Promień niepewności położenia (m)').fill('30');
    await saveEntry(page);
    const first = (await exportCase(page)).points[0].entries[0];
    expect(first.occurredAt).toEqual({
      kind: 'approximate',
      at: '2026-10-25T01:30:00.000Z',
      description: 'Mniej więcej o wpół do trzeciej',
    });
    await page
      .getByRole('article', { name: 'Wieczorna relacja', exact: true })
      .getByRole('button', { name: 'Edytuj wpis', exact: true })
      .click();
    await page.getByLabel('Identyfikacja zwierzęcia').selectOption('different_animal');
    await saveEntry(page);
    await expect(page.getByLabel('Podsumowanie obserwacji', { exact: true })).toContainText(
      'Inne: 1',
    );
    const different = (await exportCase(page)).points[0].entries[0];
    expect(different).toMatchObject({
      id: first.id,
      createdAt: first.createdAt,
      status: 'active',
      rejectionReason: null,
      identification: 'different_animal',
      uncertaintyRadiusMeters: 30,
      occurredAt: first.occurredAt,
    });
    await page.screenshot({ path: resolve(`../../.scratch/f08-history-${width}.png`) });
    await page
      .getByRole('article', { name: 'Wieczorna relacja', exact: true })
      .getByRole('button', { name: 'Edytuj wpis', exact: true })
      .click();
    await page.getByLabel('Ręcznie odrzucona relacja').check();
    await page.getByRole('button', { name: 'Zapisz wpis', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('powód odrzucenia');
    await page.getByLabel('Powód odrzucenia').fill('Błędna data');
    await saveEntry(page);
    await expect(
      page.getByRole('article', { name: 'Wieczorna relacja', exact: true }),
    ).toContainText('Relacja odrzucona: Błędna data');
    await addEntry(page, 'check', 'Odnaleziono i zabezpieczono');
    await page.getByLabel('Wynik kontroli').selectOption('animal_secured');
    await saveEntry(page);
    await addEntry(page, 'note', 'Nadal można uzupełniać');
    await saveEntry(page);
    await expect(
      page.getByRole('article', { name: 'Nadal można uzupełniać', exact: true }),
    ).toBeVisible();
    expect((await exportCase(page)).points[0].entries).toHaveLength(3);
  });
}
