import { authenticate, chooseReplacement, createCase, test } from './fixtures';
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
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
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

/** The server keeps the open case's identity; every other imported field is preserved. */
const asOpenCase = (exported: ReturnType<typeof caseFileSchema.parse>) => {
  const { exportedAt, ...document } = exported;
  void exportedAt;
  return { ...document, case: { ...document.case, id: completeFile.case.id } };
};
const { exportedAt: fixtureExportTime, ...original } = completeFile;

test('imports a complete case into the open server case, exports all data and restores it on refresh', async ({
  page,
}) => {
  const path = await createCase(page, 'Do zastąpienia');
  await chooseReplacement(page, completeFile);
  const confirmation = page.getByRole('dialog', { name: 'Zastąpienie sprawy' });
  await expect(confirmation).toContainText(completeFile.case.title);
  await confirmation.getByRole('button', { name: 'Zastąp sprawę', exact: true }).click();
  const controls = page.getByRole('region', { name: 'Sprawa' });
  await expect(controls).toContainText('Zapisano na serwerze');
  await page.reload();
  await expect(controls).toContainText(completeFile.animal.name);
  const exported = await exportCase(page);
  expect(exported.case.id).toBe(path.split('/').at(-1));
  expect(asOpenCase(exported)).toEqual(original);
  expect(exported.exportedAt).not.toBe(fixtureExportTime);
});

test('cancels replacement, exports the existing case from confirmation, and rejects bad imports', async ({
  page,
}) => {
  await createCase(page);
  await importCase(page);
  await chooseReplacement(page, { ...completeFile, case: { ...completeFile.case, title: 'Inna' } });
  const dialog = page.getByRole('dialog', { name: 'Zastąpienie sprawy' });
  const exported = await exportCase(
    page,
    dialog.getByRole('button', { name: 'Eksportuj obecną sprawę' }),
  );
  expect(asOpenCase(exported).case).toEqual(completeFile.case);
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
  expect(asOpenCase(await exportCase(page)).case).toEqual(completeFile.case);
});

test('keeps the previous server case when a replacement write fails and recovers on retry', async ({
  page,
}) => {
  await createCase(page);
  await importCase(page);
  await page.route('**/api/cases/*', (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({ status: 503, json: { error: 'database_unavailable' } })
      : route.fallback(),
  );
  await chooseReplacement(page, {
    ...completeFile,
    case: { ...completeFile.case, escape: { ...completeFile.case.escape, escapePointId: null } },
    points: [],
    areas: [],
  });
  const dialog = page.getByRole('dialog', { name: 'Zastąpienie sprawy' });
  await dialog.getByRole('button', { name: 'Zastąp sprawę', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Poprzednia sprawa');
  await dialog.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await page.unroute('**/api/cases/*');
  await page.reload();
  expect(asOpenCase(await exportCase(page))).toEqual(original);
  await page.getByRole('button', { name: 'Przybliż', exact: true }).click();
  await expect
    .poll(async () => (await exportCase(page)).mapView.zoom)
    .toBe(completeFile.mapView.zoom + 1);
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
  await page.reload();
  expect((await exportCase(page)).mapView.zoom).toBe(completeFile.mapView.zoom + 1);
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
    const path = await createCase(page);
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
    await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
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
    await reopened.goto(path);
    await expect(reopened.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
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
    await expect(reopened.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
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
  await createCase(page);
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
  await createCase(page, 'Nowa sprawa', false);
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
  await createCase(page);
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
