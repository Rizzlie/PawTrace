import { test } from './fixtures';
import { expect, type Page } from '@playwright/test';

const pageErrors = new WeakMap<Page, string[]>();

const tile = (size: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="100%" height="100%" fill="#dce8d1"/><path d="M0 80 L${size} 200" stroke="#fffef8" stroke-width="8"/></svg>`;

for (const width of [390, 1280]) {
  test(`floating layout remains usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    const search = page.getByRole('search');
    const basemaps = page.getByRole('toolbar', { name: 'Podkład mapy' });
    await expect(search).toBeVisible();
    const actions = page.getByRole('toolbar', { name: 'Działania na mapie' });
    await expect(actions).toHaveAttribute('aria-orientation', 'vertical');
    const searchBox = await search.evaluate((element) => element.getBoundingClientRect().toJSON());
    const actionBox = await actions.evaluate((element) => element.getBoundingClientRect().toJSON());
    const basemapBox = await basemaps.evaluate((element) =>
      element.getBoundingClientRect().toJSON(),
    );
    const zoomBox = await page
      .getByRole('button', { name: 'Przybliż', exact: true })
      .evaluate((element) => element.getBoundingClientRect().toJSON());
    expect(searchBox.right).toBeLessThan(actionBox.left);
    expect(Math.abs(searchBox.y - actionBox.y)).toBeLessThan(10);
    expect(basemapBox.right).toBeLessThan(zoomBox.left);
    expect(basemapBox.y).toBeGreaterThan(actionBox.bottom);
    const help = page.getByRole('button', { name: 'Jak korzystać z mapy' });
    await help.click();
    const dialog = page.getByRole('dialog', { name: 'Jak korzystać z mapy' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(help).toBeFocused();
    await page.getByRole('button', { name: 'Przybliż', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Moja lokalizacja' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const header = await page.getByRole('banner').boundingBox();
    const map = await page.getByRole('region', { name: 'Mapa poszukiwań' }).boundingBox();
    expect(map?.y).toBe(header?.height);
  });
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/map-config', (route) => route.fulfill({ json: { mapboxToken: '' } }));
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: tile(256) }),
  );
  await page.route('https://api.mapbox.com/**', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: tile(512) }),
  );
});

test('basemap toolbar supports arrow-key navigation', async ({ page }) => {
  await page.goto('/');
  const street = page.getByRole('button', { name: 'Mapa OSM', exact: true });
  const satellite = page.getByRole('button', { name: 'Satelita', exact: true });
  await street.focus();
  await page.keyboard.press('ArrowRight');
  await expect(satellite).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByText('Satelita wymaga skonfigurowania tokenu Mapbox.', {
      exact: false,
    }),
  ).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

test('map fills the workspace, supports keyboard zoom, and keeps OSM usable without a token', async ({
  page,
}) => {
  await page.goto('/');
  const map = page.getByRole('region', { name: 'Mapa poszukiwań' });
  await expect(map.locator('img.leaflet-tile-loaded').first()).toBeVisible();
  const mapBox = await map.evaluate((element) => ({
    width: element.clientWidth,
    height: element.clientHeight,
  }));
  const workspace = await page
    .getByRole('region', { name: 'Przestrzeń poszukiwań' })
    .evaluate((element) => ({
      width: element.clientWidth,
      height: element.clientHeight,
    }));
  expect(mapBox.width).toBeGreaterThan(workspace.width * 0.98);
  expect(mapBox.height).toBeGreaterThan(workspace.height * 0.98);
  await expect(
    page.locator('.leaflet-control-attribution').getByRole('link', { name: 'OpenStreetMap' }),
  ).toBeVisible();
  const scale = page.locator('.leaflet-control-scale-line');
  const originalScale = await scale.textContent();
  await map.focus();
  await page.keyboard.press('+');
  await expect(scale).not.toHaveText(originalScale ?? '');
  await page.getByRole('button', { name: 'Satelita', exact: true }).click();
  await expect(
    page.getByText('Satelita wymaga skonfigurowania tokenu Mapbox.', {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mapa OSM', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('switches real Leaflet layers without changing viewport and displays provider attribution', async ({
  page,
}) => {
  await page.route('**/api/map-config', (route) =>
    route.fulfill({ json: { mapboxToken: 'pk.controlled-test' } }),
  );
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith('https://api.mapbox.com/')) requests.push(request.url());
  });
  await page.goto('/');
  await expect(page.locator('img.leaflet-tile-loaded').first()).toBeVisible();
  const scale = await page.locator('.leaflet-control-scale-line').textContent();
  await page.getByRole('button', { name: 'Satelita', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Satelita', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    page.locator('img.leaflet-tile-loaded[src*="api.mapbox.com"]').first(),
  ).toBeVisible();
  await expect(page.locator('.leaflet-control-scale-line')).toHaveText(scale ?? '');
  await expect(page.getByRole('link', { name: 'Improve this map' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Mapbox', exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.locator('.mapbox-logo img').evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.every((url) => url.includes('/satellite-streets-v12/tiles/512/'))).toBe(true);
  await page.getByRole('button', { name: 'Mapa OSM', exact: true }).click();
  await expect(page.locator('.leaflet-control-scale-line')).toHaveText(scale ?? '');
  await expect(page.getByRole('link', { name: 'Improve this map' })).toHaveCount(0);
});

for (const status of [401, 403, 429, 503]) {
  test(`satellite HTTP ${status} falls back to navigable OSM`, async ({ page }) => {
    await page.route('**/api/map-config', (route) =>
      route.fulfill({ json: { mapboxToken: 'pk.controlled-test' } }),
    );
    await page.route('https://api.mapbox.com/**', (route) =>
      route.fulfill({ status, body: 'Unavailable' }),
    );
    await page.goto('/');
    await page.getByRole('button', { name: 'Satelita', exact: true }).click();
    await expect(page.getByText('Przywrócono mapę OSM.', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mapa OSM', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(
      page.locator('img.leaflet-tile-loaded[src*="openstreetmap.org"]').first(),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Przybliż', exact: true }).click();
  });
}

test('OSM failure has an explicit recovery action', async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({ status: 503, body: 'Unavailable' }),
  );
  await page.goto('/');
  await expect(page.getByText('Nie udało się pobrać mapy OSM.', { exact: false })).toBeVisible();
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: tile(256) }),
  );
  await page.getByRole('button', { name: 'Ponów pobieranie mapy' }).click();
  await expect(page.locator('img.leaflet-tile-loaded').first()).toBeVisible();
  await expect(page.getByText('Nie udało się pobrać mapy OSM.', { exact: false })).toHaveCount(0);
});

test('location denial leaves manual navigation available', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (_success: unknown, failure: (error: { code: number }) => void) =>
          failure({ code: 1 }),
      },
    });
  });
  await page.goto('/');
  await expect(page.getByText('Brak zgody na lokalizację.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Przybliż', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Moja lokalizacja' })).toBeEnabled();
});

test('location is requested on entry and can be refreshed manually', async ({ context, page }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({
    latitude: 52.23,
    longitude: 21.01,
    accuracy: 25,
  });
  await page.goto('/');

  const locate = page.getByRole('button', { name: 'Moja lokalizacja' });
  await expect(locate).toBeEnabled();
  await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(2);
  await page.getByRole('button', { name: 'Mapa OSM', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(locate).toBeFocused();
  await expect(
    page
      .getByText('Dokładność ostatniej pozycji: około 25 m', { exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(locate).toHaveAccessibleDescription('Dokładność ostatniej pozycji: około 25 m');
  await expect(page.getByRole('complementary', { name: 'Komunikaty mapy' })).toBeHidden();
  await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(2);
  await context.setGeolocation({
    latitude: 52.24,
    longitude: 21.02,
    accuracy: 40,
  });
  await page.getByRole('button', { name: 'Moja lokalizacja' }).click();
  await expect(locate).toBeEnabled();
  await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(2);
  await page.getByRole('button', { name: 'Mapa OSM', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(locate).toBeFocused();
  await expect(
    page
      .getByText('Dokładność ostatniej pozycji: około 40 m', { exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(locate).toHaveAccessibleDescription('Dokładność ostatniej pozycji: około 40 m');
  await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(2);
});

test('configuration failure does not block the map and can be retried', async ({ page }) => {
  await page.route('**/api/map-config', (route) =>
    route.fulfill({ status: 503, body: 'Unavailable' }),
  );
  await page.goto('/');
  await expect(
    page.getByText('Nie udało się pobrać konfiguracji satelity.', {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.locator('img.leaflet-tile-loaded').first()).toBeVisible();
  await page.route('**/api/map-config', (route) =>
    route.fulfill({ json: { mapboxToken: 'pk.controlled-test' } }),
  );
  await page.getByRole('button', { name: 'Ponów konfigurację' }).click();
  await expect(page.getByRole('button', { name: 'Ponów konfigurację' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Satelita', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Satelita', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('uses runtime source templates and their corresponding attribution for both basemaps', async ({
  page,
}) => {
  await page.route('**/api/map-config', (route) =>
    route.fulfill({
      json: {
        mapboxToken: '',
        osm: {
          urlTemplate: 'https://maps.example.test/street/{z}/{x}/{y}.png',
          attribution: '<a href="https://maps.example.test/street">Street provider</a>',
        },
        satellite: {
          urlTemplate: 'https://maps.example.test/satellite/{z}/{x}/{y}.png',
          attribution: '<a href="https://maps.example.test/satellite">Satellite provider</a>',
        },
      },
    }),
  );
  await page.route('https://maps.example.test/street/**', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: tile(256) }),
  );
  await page.route('https://maps.example.test/satellite/**', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: tile(512) }),
  );
  await page.goto('/');
  await expect(
    page.locator('img.leaflet-tile-loaded[src*="maps.example.test/street/"]').first(),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Street provider' })).toBeVisible();
  const scale = await page.locator('.leaflet-control-scale-line').textContent();
  await page.getByRole('button', { name: 'Satelita', exact: true }).click();
  await expect(
    page.locator('img.leaflet-tile-loaded[src*="maps.example.test/satellite/"]').first(),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Satellite provider' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Street provider' })).toHaveCount(0);
  await expect(page.locator('.mapbox-logo')).toHaveCount(0);
  await expect(page.locator('.leaflet-control-scale-line')).toHaveText(scale ?? '');
});

test('rejects incomplete provider configuration and keeps the default map navigable', async ({
  page,
}) => {
  await page.route('**/api/map-config', (route) =>
    route.fulfill({
      json: {
        mapboxToken: '',
        osm: {
          urlTemplate: 'https://maps.example.test/{z}/{x}/{y}.png',
          attribution: '',
        },
      },
    }),
  );
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Ponów konfigurację' })).toBeVisible();
  await expect(
    page.locator('img.leaflet-tile-loaded[src*="tile.openstreetmap.org/"]').first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Przybliż', exact: true }).click();
});
