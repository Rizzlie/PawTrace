import { test, createCase } from './fixtures';
import { expect, type Page } from '@playwright/test';
import { caseFileSchema } from '@pawtrace/case-domain';
import completeFile from '@pawtrace/case-domain/fixtures/complete-case-v1.json';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Generated 16×12 solid orange PNG; no native decoder dependency in the browser-test project.
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAIAAADkharWAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGElEQVQokWP4WG1KEmIY1VA9GkofsYUBANDVONCI6gDsAAAAAElFTkSuQmCC',
  'base64',
);

const testFilename = 'efb08652-e68f-4652-a876-38197646d123.heic';
const pendingMetadata = {
  filename: testFilename,
  originalName: 'kot.heic',
  mediaType: 'image/heic',
  sizeBytes: 42,
  widthPixels: null,
  heightPixels: null,
  thumbnailFilename: null,
  previewFilename: null,
  processing: {
    thumbnail: { status: 'failed', error: 'decoder_failed' },
    preview: { status: 'failed', error: 'decoder_failed' },
  },
};

async function start(page: Page) {
  await page.route('**/api/map-config', (route) => route.fulfill({ json: { mapboxToken: '' } }));
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"/>',
    }),
  );
  await createCase(page);
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
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

async function importCase(page: Page, file: unknown) {
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
  await page.getByRole('button', { name: 'Plik JSON', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Importuj JSON', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape');
  await page.getByLabel('Importuj plik JSON').setInputFiles({
    name: 'photos.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  });
  await page.getByRole('button', { name: 'Zastąp sprawę', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Zastąpienie sprawy' })).toBeHidden();
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
}

test('denies ownerless uploads without losing profile text', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: 'Edytuj profil', exact: true }).click();
  await page.getByLabel('Imię', { exact: true }).fill('Zachowany profil');
  const denied = page.waitForResponse(
    (response) => response.url().endsWith('/api/assets') && response.request().method() === 'POST',
  );
  await page.getByLabel('Dodaj zdjęcia', { exact: true }).setInputFiles({
    name: 'kot.png',
    mimeType: 'image/png',
    buffer: Buffer.from('invalid image for controlled failure'),
  });
  expect((await denied).status()).toBe(404);
  await expect(page.getByText('Nie zapisano pliku.', { exact: false })).toBeVisible();
  await expect(page.getByLabel('Imię', { exact: true })).toHaveValue('Zachowany profil');
  await page.getByRole('button', { name: 'Zapisz profil', exact: true }).click();
  await expect(page.getByText('Zachowany profil', { exact: true })).toBeVisible();
});

// P01 intentionally denies every ownerless photo. Restore this acceptance scenario
// with the owner-authorized photo routes in P03; isolated storage tests remain active.
test.fixme('[P03 ownership required] uploads originals, views thumbnails, transfers profile metadata and resolves an older export after unlinking', async ({
  page,
  request,
}) => {
  await start(page);
  const bytes = await readFile(resolve('src/fixtures/photo-detail.png'));
  await page.getByRole('button', { name: 'Edytuj profil', exact: true }).click();
  const response = page.waitForResponse(
    (response) => response.url().endsWith('/api/assets') && response.request().method() === 'POST',
  );
  await page
    .getByLabel('Dodaj zdjęcia', { exact: true })
    .setInputFiles({ name: 'kot.png', mimeType: 'image/png', buffer: bytes });
  const { filename } = (await (await response).json()) as { filename: string };
  const photo = page.getByRole('article', { name: `Zdjęcie ${filename}`, exact: true });
  await expect(
    photo.getByRole('button', { name: `Otwórz zdjęcie ${filename}`, exact: true }),
  ).toBeVisible();
  await page.getByLabel('Podpis ' + filename, { exact: true }).fill('Pomarańczowe futro');
  await page.getByLabel('Zdjęcie główne', { exact: true }).selectOption(filename);
  await photo.getByRole('button', { name: 'Powiększ zdjęcie', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Podgląd zdjęcia' }).getByRole('img'),
  ).toBeVisible();
  const viewer = page.getByRole('dialog', { name: 'Podgląd zdjęcia' });
  await viewer.getByRole('button', { name: 'Rozmiar oryginalny (1:1)', exact: true }).click();
  await expect(viewer.getByRole('img')).toHaveJSProperty('clientWidth', 1600);
  await expect(viewer.getByRole('img')).toHaveJSProperty('naturalWidth', 1600);
  await expect(viewer.getByRole('button', { name: 'Dopasuj do okna', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Zamknij podgląd' }).click();
  const original = await request.get('/api/assets/' + filename);
  expect(await original.body()).toEqual(bytes);
  await page.getByRole('button', { name: 'Zapisz profil', exact: true }).click();
  const saved = await exportCase(page);
  expect(saved.animal?.photos).toEqual([filename]);
  expect(saved.animal?.mainPhoto).toBe(filename);
  expect(saved.animal?.photoCaptions).toEqual([{ filename, caption: 'Pomarańczowe futro' }]);
  expect(saved.assets[0].thumbnailFilename).toBe(filename + '.thumbnail.png');
  await page.reload();
  await page.getByRole('button', { name: 'Edytuj profil', exact: true }).click();
  await expect(page.getByLabel('Podpis ' + filename, { exact: true })).toHaveValue(
    'Pomarańczowe futro',
  );
  await page.getByRole('button', { name: 'Odepnij ' + filename, exact: true }).click();
  await page.getByRole('button', { name: 'Zapisz profil', exact: true }).click();
  expect((await exportCase(page)).animal?.photos).toEqual([]);
  expect(await (await request.get('/api/assets/' + filename)).body()).toEqual(bytes);
  await importCase(page, saved);
  await page.getByRole('button', { name: 'Edytuj profil', exact: true }).click();
  await expect(
    page.getByRole('button', { name: `Otwórz zdjęcie ${filename}`, exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: 'dist/f13-profile.png', fullPage: true });
});

test('retries mixed uploads and failed HEIC derivatives without losing text or saved originals', async ({
  page,
}) => {
  await start(page);
  let attempts = 0;
  let ready = false;
  const secondFilename = testFilename.replace('123.heic', '124.heic');
  await page.route(/\/api\/assets$/, (route) => {
    attempts++;
    return attempts === 2
      ? route.fulfill({ status: 507, json: { message: 'Brak miejsca' } })
      : route.fulfill({
          status: 201,
          json: { ...pendingMetadata, filename: attempts === 1 ? testFilename : secondFilename },
        });
  });
  await page.route('**/api/assets/*/metadata', (route) => {
    const filename = route.request().url().split('/').at(-2);
    return route.fulfill({
      json: {
        ...pendingMetadata,
        filename,
        ...(ready
          ? {
              widthPixels: 16,
              heightPixels: 12,
              thumbnailFilename: 'thumbnail.png',
              previewFilename: 'preview.png',
              processing: {
                thumbnail: { status: 'ready', filename: 'thumbnail.png' },
                preview: { status: 'ready', filename: 'preview.png' },
              },
            }
          : {}),
      },
    });
  });
  await page.route('**/api/assets/*/retry', (route) => {
    ready = true;
    return route.fulfill({ status: 201, json: {} });
  });
  await page.route('**/api/assets/*/thumbnail', (route) =>
    route.fulfill({ contentType: 'image/png', body: png }),
  );
  await page.route('**/api/assets/*/preview', (route) =>
    route.fulfill({ contentType: 'image/png', body: png }),
  );
  await page.getByRole('button', { name: 'Edytuj profil', exact: true }).click();
  await page.getByLabel('Imię', { exact: true }).fill('Tekst mimo błędów');
  await page.getByLabel('Dodaj zdjęcia', { exact: true }).setInputFiles([
    { name: 'a.heic', mimeType: 'image/heic', buffer: Buffer.from('controlled first photo') },
    { name: 'b.heic', mimeType: 'image/heic', buffer: Buffer.from('controlled second photo') },
  ]);
  await expect(
    page.getByRole('button', { name: 'Ponów przesyłanie b.heic', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Nie udało się przygotować podglądu. Oryginał jest zapisany.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Ponów przesyłanie b.heic', exact: true }).click();
  const first = page.getByRole('article', { name: 'Zdjęcie ' + testFilename, exact: true });
  await first.getByRole('button', { name: 'Ponów przetwarzanie', exact: true }).click();
  await expect(first.getByRole('button', { name: 'Powiększ zdjęcie', exact: true })).toBeVisible();
  await first.getByRole('button', { name: 'Powiększ zdjęcie', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Podgląd zdjęcia' }).getByRole('img'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Zamknij podgląd' }).click();
  await expect(page.getByLabel('Imię', { exact: true })).toHaveValue('Tekst mimo błędów');
  await page.getByRole('button', { name: 'Zapisz profil', exact: true }).click();
  const saved = await exportCase(page);
  expect(saved.animal?.photos).toEqual([testFilename, secondFilename]);
  expect(saved.assets.find((asset) => asset.filename === testFilename)?.previewFilename).toBe(
    testFilename + '.preview.png',
  );
});

test('retains unavailable photo references through import, editing and export', async ({
  page,
}) => {
  await start(page);
  await page.route('**/api/assets/**', (route) =>
    route.fulfill({ status: 404, json: { message: 'Zdjęcie niedostępne' } }),
  );
  const file = { ...completeFile, mapView: { ...completeFile.mapView, basemap: 'osm' } };
  await importCase(page, file);
  await page.getByRole('button', { name: 'Edytuj profil', exact: true }).click();
  await expect(
    page
      .getByRole('article', { name: 'Zdjęcie unavailable-original.jpg', exact: true })
      .getByText('Zdjęcie niedostępne.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Zapisz profil', exact: true }).click();
  const saved = await exportCase(page);
  expect(saved.animal?.photos).toEqual(file.animal.photos);
  expect(saved.animal?.mainPhoto).toBe(file.animal.mainPhoto);
  expect(saved.animal?.photoCaptions).toEqual(file.animal.photoCaptions);
});

test('never attaches a late upload to another editor or replaced case', async ({ page }) => {
  await start(page);
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let received!: () => void;
  const arrived = new Promise<void>((resolve) => {
    received = resolve;
  });
  await page.route(/\/api\/assets$/, async (route) => {
    received();
    await gate;
    await route.fulfill({ status: 201, json: pendingMetadata });
  });
  await page.getByRole('button', { name: 'Edytuj profil', exact: true }).click();
  await page.getByLabel('Dodaj zdjęcia', { exact: true }).setInputFiles({
    name: 'late.heic',
    mimeType: 'image/heic',
    buffer: Buffer.from('controlled delayed photo'),
  });
  await arrived;
  const cancelled = page.waitForEvent(
    'requestfailed',
    (request) => request.url().endsWith('/api/assets') && request.method() === 'POST',
  );
  await page.getByRole('button', { name: 'Anuluj edycję', exact: true }).click();
  await page.getByRole('link', { name: 'Moje sprawy', exact: true }).click();
  await createCase(page, 'Nowa sprawa', false);
  await page.getByRole('button', { name: 'Edytuj profil', exact: true }).click();
  finish();
  expect((await cancelled).failure()?.errorText).toBe('net::ERR_ABORTED');
  await expect(page.getByText('Brak dołączonych zdjęć.', { exact: true })).toBeVisible();
  await page.getByLabel('Imię', { exact: true }).fill('Nowa sprawa');
  await page.getByRole('button', { name: 'Zapisz profil', exact: true }).click();
  expect((await exportCase(page)).animal?.photos).toEqual([]);
});

test('confirms an incomplete successful upload response without posting the file twice', async ({
  page,
}) => {
  await start(page);
  let uploads = 0;
  await page.route(/\/api\/assets$/, (route) => {
    uploads++;
    return route.fulfill({ status: 201, json: { filename: testFilename } });
  });
  await page.route('**/api/assets/*/metadata', (route) => route.fulfill({ json: pendingMetadata }));
  await page.getByRole('button', { name: 'Edytuj profil', exact: true }).click();
  await page.getByLabel('Dodaj zdjęcia', { exact: true }).setInputFiles({
    name: 'confirmed.heic',
    mimeType: 'image/heic',
    buffer: Buffer.from('controlled original'),
  });
  await expect(page.getByText('Nie potwierdzono danych pliku.', { exact: false })).toBeVisible();
  await expect(page.getByText('Nie zapisano pliku.', { exact: false })).toBeHidden();
  await page
    .getByRole('button', { name: 'Ponów potwierdzenie confirmed.heic', exact: true })
    .click();
  await expect(
    page.getByRole('article', { name: 'Zdjęcie ' + testFilename, exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Zapisz profil', exact: true }).click();
  expect((await exportCase(page)).animal?.photos).toEqual([testFilename]);
  expect(uploads).toBe(1);
});

test.fixme('[P03 ownership required] attaches photos to all point-entry types and area checks without duplicating their event data', async ({
  page,
}) => {
  await start(page);
  await importCase(page, { ...completeFile, mapView: { ...completeFile.mapView, basemap: 'osm' } });
  const places = page.getByRole('complementary', { name: 'Miejsca', exact: true });
  await expect(page.getByRole('button', { name: 'Zwiń miejsca', exact: true })).toBeVisible();
  await places.getByRole('button', { name: 'Dom', exact: true }).click();
  const originals: string[] = [];
  for (const type of ['observation', 'action', 'check', 'note']) {
    await page.getByRole('button', { name: 'Dodaj wpis', exact: true }).click();
    await page.getByLabel('Typ wpisu', { exact: true }).selectOption(type);
    await page.getByLabel('Opis wpisu', { exact: true }).fill('Zdjęcie: ' + type);
    const response = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/assets') && response.request().method() === 'POST',
    );
    await page
      .getByLabel('Dodaj zdjęcia', { exact: true })
      .setInputFiles({ name: type + '.png', mimeType: 'image/png', buffer: png });
    const { filename } = (await (await response).json()) as { filename: string };
    originals.push(filename);
    await expect(
      page.getByRole('button', { name: 'Odepnij ' + filename, exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Zapisz wpis', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Zapisz wpis', exact: true })).toBeHidden();
  }
  await places.getByRole('button', { name: 'Park', exact: true }).click();
  await page.getByRole('button', { name: 'Dodaj przeszukanie', exact: true }).click();
  await page.getByLabel('Opis przeszukania', { exact: true }).fill('Obchód ze zdjęciem');
  const response = page.waitForResponse(
    (response) => response.url().endsWith('/api/assets') && response.request().method() === 'POST',
  );
  await page
    .getByLabel('Dodaj zdjęcia', { exact: true })
    .setInputFiles({ name: 'park.png', mimeType: 'image/png', buffer: png });
  const { filename } = (await (await response).json()) as { filename: string };
  await expect(
    page.getByRole('button', { name: 'Odepnij ' + filename, exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Zapisz przeszukanie', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Zapisz przeszukanie', exact: true })).toBeHidden();
  const saved = await exportCase(page);
  const entries = saved.points.find((point) => point.name === 'Dom')?.entries.slice(-4);
  expect(entries?.map((entry) => entry.photos)).toEqual(originals.map((filename) => [filename]));
  expect(entries?.map((entry) => entry.description)).toEqual([
    'Zdjęcie: observation',
    'Zdjęcie: action',
    'Zdjęcie: check',
    'Zdjęcie: note',
  ]);
  const check = saved.areas.find((area) => area.name === 'Park')?.checks.at(-1);
  expect(check?.description).toBe('Obchód ze zdjęciem');
  expect(check?.photos).toEqual([filename]);
  expect(check?.actualGeometry).toEqual(completeFile.areas[0].plannedGeometry);
});
