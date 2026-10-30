import { authenticate, test } from './fixtures';
import { expect, type Page, type BrowserContext } from '@playwright/test';
import { caseFileSchema } from '@pawtrace/case-domain';
import completeFile from '@pawtrace/case-domain/fixtures/complete-case-v1.json';

async function configureMap(context: BrowserContext, satelliteAvailable = false) {
  await authenticate(context);
  await context.addInitScript(() => localStorage.setItem('pawtrace.map-help.seen.v1', 'true'));
  await context.route('**/api/map-config', (route) =>
    route.fulfill({
      json: { mapboxToken: satelliteAvailable ? 'pk.controlled-test' : '' },
    }),
  );
  for (const [url, size] of [
    ['https://tile.openstreetmap.org/**', 256],
    ['https://api.mapbox.com/**', 512],
  ] as const) {
    await context.route(url, (route) =>
      route.fulfill({
        contentType: 'image/svg+xml',
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="100%" height="100%" fill="#dce8d1"/></svg>`,
      }),
    );
  }
}

test.beforeEach(async ({ context }) => {
  await configureMap(context);
});

async function importCase(page: Page, file: unknown = completeFile) {
  await expect(page.getByLabel('Importuj plik JSON')).toBeEnabled();
  await page.getByLabel('Importuj plik JSON').setInputFiles({
    name: 'case.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  });
  const dialog = page.getByRole('dialog', { name: 'Zastąpienie sprawy' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Zastąp sprawę', exact: true }).click();
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano w przeglądarce');
}

async function exportCase(page: Page, button?: import('@playwright/test').Locator) {
  if (!button) await page.getByRole('button', { name: 'Plik JSON', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await (button ?? page.getByRole('menuitem', { name: 'Eksportuj JSON', exact: true })).click();
  const stream = await (await downloadPromise).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return caseFileSchema.parse(JSON.parse(Buffer.concat(chunks).toString()));
}

test('imports a complete case, exports all data, and restores it on refresh', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('Importuj plik JSON')).toBeEnabled();
  await page.getByLabel('Importuj plik JSON').setInputFiles({
    name: 'case.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(completeFile)),
  });
  const confirmation = page.getByRole('dialog', { name: 'Zastąpienie sprawy' });
  await expect(confirmation).toContainText(completeFile.case.title);
  await confirmation.getByRole('button', { name: 'Zastąp sprawę', exact: true }).click();
  const controls = page.getByRole('region', { name: 'Sprawa' });
  await expect(controls).toContainText('Zapisano w przeglądarce');
  await page.reload();
  await expect(controls).toContainText(completeFile.animal.name);
  const { exportedAt, ...exported } = await exportCase(page);
  const { exportedAt: oldExportTime, ...original } = completeFile;
  expect(exported).toEqual(original);
  expect(exportedAt).not.toBe(oldExportTime);
});

test('cancels replacement, exports the existing case from confirmation, and rejects bad imports', async ({
  page,
}) => {
  await page.goto('/');
  await importCase(page);
  await page.getByRole('button', { name: 'Nowa sprawa', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Zastąpienie sprawy' });
  const exported = await exportCase(
    page,
    dialog.getByRole('button', { name: 'Eksportuj obecną sprawę' }),
  );
  expect(exported.case).toEqual(completeFile.case);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  for (const text of [
    '{',
    JSON.stringify({ ...completeFile, schemaVersion: 99 }),
    JSON.stringify({
      ...completeFile,
      points: [{ ...completeFile.points[0], roles: ['invalid'] }],
    }),
  ]) {
    await expect(page.getByLabel('Importuj plik JSON')).toBeEnabled();
    await page.getByLabel('Importuj plik JSON').setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from(text),
    });
    await expect(page.getByRole('region', { name: 'Sprawa' }).getByRole('alert')).toBeVisible();
    await expect(dialog).toBeHidden();
  }
  await page.reload();
  expect((await exportCase(page)).case).toEqual(completeFile.case);
});

test('retains memory after aborted writes, preserves the old snapshot on failed replacement and recovers on retry', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let fail = false;
    window.addEventListener('fail-snapshot-write', () => {
      fail = true;
    });
    window.addEventListener('recover-snapshot-write', () => {
      fail = false;
    });
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      const request = put.call(this, value, key);
      if (fail && this.name === 'snapshots')
        request.addEventListener('success', () => this.transaction.abort());
      return request;
    };
  });
  await page.goto('/');
  await importCase(page);
  await page.evaluate(() => window.dispatchEvent(new Event('fail-snapshot-write')));
  await page.getByRole('button', { name: 'Przybliż', exact: true }).click();
  await expect(page.getByLabel('Stan zapisu')).toContainText('Nie zapisano');
  const unsaved = await exportCase(page);
  expect(unsaved.mapView.zoom).toBe(completeFile.mapView.zoom + 1);
  await page.getByRole('button', { name: 'Nowa sprawa', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Zastąpienie sprawy' });
  await dialog.getByRole('button', { name: 'Zastąp sprawę', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Poprzednia sprawa');
  await dialog.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await page.reload();
  expect((await exportCase(page)).mapView).toEqual(completeFile.mapView);
  await page.evaluate(() => window.dispatchEvent(new Event('fail-snapshot-write')));
  await page.getByRole('button', { name: 'Przybliż', exact: true }).click();
  await expect(page.getByLabel('Stan zapisu')).toContainText('Nie zapisano');
  await page.evaluate(() => window.dispatchEvent(new Event('recover-snapshot-write')));
  await page.getByRole('button', { name: 'Ponów zapis', exact: true }).click();
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano w przeglądarce');
  await page.reload();
  expect((await exportCase(page)).mapView.zoom).toBe(completeFile.mapView.zoom + 1);
});

test('preserves invalid startup storage until explicit replacement and creates a new case', async ({
  page,
}) => {
  await page.goto('/');
  await importCase(page);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('pawtrace', 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('snapshots', 'readwrite');
          tx.objectStore('snapshots').put(
            { schemaVersion: 99, original: 'recoverable' },
            'current',
          );
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
        request.onerror = () => reject(request.error);
      }),
  );
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Zachowano jej dane');
  await page.getByRole('button', { name: 'Nowa sprawa', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Zastąpienie sprawy' });
  await dialog.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Zachowano jej dane');
  await page.getByRole('button', { name: 'Nowa sprawa', exact: true }).click();
  await dialog.getByRole('button', { name: 'Zastąp sprawę', exact: true }).click();
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano w przeglądarce');
  await page.reload();
  const created = await exportCase(page);
  expect(created.case.title).toBe('Nowa sprawa');
  expect(created.points).toEqual([]);
  expect(created.case.id).not.toBe(completeFile.case.id);
});

test('restores center, zoom and basemap after reopening the browser and offers OSM when satellite access is missing', async ({
  playwright,
  baseURL,
}, testInfo) => {
  const profile = testInfo.outputPath('browser-profile');
  const open = async () => {
    const context = await playwright.chromium.launchPersistentContext(profile, {
      baseURL,
    });
    await configureMap(context);
    return context;
  };
  let context = await open();
  try {
    const page = await context.newPage();
    await page.goto('/');
    await importCase(page);
    await expect(page.getByRole('radio', { name: 'Mapa OSM', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByText('Zapisano widok satelitarny', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Przybliż', exact: true }).click();
    await expect
      .poll(async () => (await exportCase(page)).mapView.zoom)
      .toBe(completeFile.mapView.zoom + 1);
    await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano w przeglądarce');
    const before = (await exportCase(page)).mapView;
    await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
    const tilePaths = () =>
      page
        .locator('.leaflet-tile-loaded')
        .evaluateAll((tiles) =>
          tiles.map((tile) => new URL((tile as HTMLImageElement).src).pathname).sort(),
        );
    const beforeTiles = await tilePaths();
    await context.close();
    context = await open();
    const reopened = await context.newPage();
    await reopened.goto('/');
    await expect(reopened.getByLabel('Stan zapisu')).toHaveText('Zapisano w przeglądarce');
    expect((await exportCase(reopened)).mapView).toEqual(before);
    await expect
      .poll(() =>
        reopened
          .locator('.leaflet-tile-loaded')
          .evaluateAll((tiles) =>
            tiles.map((tile) => new URL((tile as HTMLImageElement).src).pathname).sort(),
          ),
      )
      .toEqual(beforeTiles);
    await reopened.getByRole('radio', { name: 'Mapa OSM', exact: true }).click();
    await expect.poll(async () => (await exportCase(reopened)).mapView.basemap).toBe('osm');
    await expect(reopened.getByLabel('Stan zapisu')).toHaveText('Zapisano w przeglądarce');
    await reopened.reload();
    expect((await exportCase(reopened)).mapView.basemap).toBe('osm');
  } finally {
    await context.close();
  }
});

test('restores the satellite selection when the configured provider is available', async ({
  page,
  context,
}) => {
  await configureMap(context, true);
  await page.goto('/');
  await importCase(page);
  await expect(page.getByRole('radio', { name: 'Satelita', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(
    page.locator('img.leaflet-tile-loaded[src*="api.mapbox.com"]').first(),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Satelita', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(
    page.locator('img.leaflet-tile-loaded[src*="api.mapbox.com"]').first(),
  ).toBeVisible();
  expect((await exportCase(page)).mapView).toEqual(completeFile.mapView);
});

test('new case replaces the basemap selected before a case existed', async ({ page, context }) => {
  await configureMap(context, true);
  await page.goto('/');
  await page.getByRole('radio', { name: 'Satelita', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Satelita', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByRole('button', { name: 'Nowa sprawa', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Zastąp sprawę', exact: true })
    .click();
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano w przeglądarce');
  await expect(page.getByRole('radio', { name: 'Mapa OSM', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  expect((await exportCase(page)).mapView.basemap).toBe('osm');
});

test('startup location preserves a restored case viewport and factual timestamp', async ({
  context,
  page,
}) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({
    latitude: 54.35,
    longitude: 18.65,
    accuracy: 30,
  });
  await page.goto('/');
  await importCase(page);
  await page.reload();
  const locate = page.getByRole('button', { name: 'Moja lokalizacja' });
  await expect(locate).toBeEnabled();
  await expect(page.locator('.pt-location-accuracy, .pt-location-position')).toHaveCount(2);
  await page.getByRole('radio', { name: 'Mapa OSM', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(locate).toBeFocused();
  await expect(
    page
      .getByText('Dokładność ostatniej pozycji: około 30 m', { exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(locate).toHaveAccessibleDescription('Dokładność ostatniej pozycji: około 30 m');
  const exported = await exportCase(page);
  expect(exported.mapView).toEqual(completeFile.mapView);
  expect(exported.case.updatedAt).toBe(completeFile.case.updatedAt);
  await page.getByRole('button', { name: 'Moja lokalizacja' }).click();
  await expect.poll(async () => (await exportCase(page)).mapView.zoom).toBe(16);
  expect((await exportCase(page)).case.updatedAt).toBe(completeFile.case.updatedAt);
});
