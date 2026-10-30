import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { caseFileSchema } from '@pawtrace/case-domain';
import completeFile from '@pawtrace/case-domain/fixtures/complete-case-v1.json';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Switches the controlled provider's identity, so this project runs serially and alone.
test.describe.configure({ mode: 'serial' });
const control = 'http://127.0.0.1:3902';
const run = Date.now().toString(36);
test.afterEach(async ({ request }) => {
  await request.post(control + '/provider');
});

async function signedIn(
  browser: import('@playwright/test').Browser,
  request: APIRequestContext,
  subject: string,
) {
  const context = await browser.newContext();
  await context.addInitScript(() => localStorage.setItem('pawtrace.map-help.seen.v1', 'true'));
  await context.route('**/api/map-config', (route) => route.fulfill({ json: { mapboxToken: '' } }));
  await context.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"/>',
    }),
  );
  await request.post(`${control}/provider?subject=${subject}-${run}`);
  const login = await context.request.get('/api/auth/login');
  expect(login.url().endsWith('/')).toBe(true);
  await request.post(control + '/provider');
  return context;
}

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

async function createFromCatalogue(page: Page, title: string) {
  await page.getByRole('button', { name: 'Nowa sprawa', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nowa sprawa' });
  await dialog.getByLabel('Nazwa sprawy').fill(title);
  await dialog.getByRole('button', { name: 'Utwórz sprawę', exact: true }).click();
  await expect(page).toHaveURL(/\/cases\/[0-9a-f-]{36}$/u);
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
  return new URL(page.url()).pathname.split('/').at(-1) ?? '';
}

async function mutate(context: BrowserContext, method: string, path: string, data?: unknown) {
  const csrf =
    (await context.cookies()).find((cookie) => cookie.name === 'XSRF-TOKEN')?.value ?? '';
  return context.request.fetch(path, {
    method,
    data,
    headers: {
      origin: 'http://127.0.0.1:4200',
      'x-xsrf-token': csrf,
      'if-match': '"1"',
      'idempotency-key': crypto.randomUUID(),
    },
  });
}

test('creates, edits and reopens a private case in a second browser while another owner is denied', async ({
  browser,
  request,
}) => {
  // Three browser contexts plus an application restart exceed the default budget.
  test.setTimeout(120_000);
  const first = await signedIn(browser, request, 'owner');
  const second = await signedIn(browser, request, 'owner');
  const stranger = await signedIn(browser, request, 'stranger');
  try {
    const page = await first.newPage();
    await page.goto('/');
    const catalogue = page.getByRole('complementary', { name: 'Moje sprawy' });
    await expect(catalogue).toContainText('Nie masz jeszcze żadnych spraw');
    const id = await createFromCatalogue(page, 'Luna z Żoliborza');

    await page.getByLabel('Importuj plik JSON').setInputFiles({
      name: 'case.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(completeFile)),
    });
    await page
      .getByRole('dialog', { name: 'Zastąpienie sprawy' })
      .getByRole('button', { name: 'Zastąp sprawę', exact: true })
      .click();
    await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
    await page.getByRole('button', { name: 'Edytuj profil', exact: true }).click();
    await page.getByLabel('Gatunek', { exact: true }).fill('Kot domowy 🐾');
    await page.getByRole('button', { name: 'Zapisz profil', exact: true }).click();
    await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
    const edited = await exportCase(page);
    const { exportedAt, ...original } = completeFile;
    void exportedAt;
    expect(edited.case.id).toBe(id);
    expect(edited.animal?.species).toBe('Kot domowy 🐾');

    const other = await second.newPage();
    await other.goto('/');
    await other
      .getByRole('complementary', { name: 'Moje sprawy' })
      .getByRole('link', { name: completeFile.case.title })
      .click();
    await expect(other.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
    const reopened = await exportCase(other);
    expect(reopened).toEqual(edited);
    expect({
      ...reopened,
      case: { ...reopened.case, id: original.case.id, updatedAt: original.case.updatedAt },
      animal: { ...reopened.animal, species: original.animal.species },
    }).toEqual(original);

    // The second browser saves first; the first browser's next write is stale and rejected.
    await other.getByRole('button', { name: 'Przybliż', exact: true }).click();
    await expect
      .poll(async () => (await exportCase(other)).mapView.zoom)
      .toBe(completeFile.mapView.zoom + 1);
    await expect(other.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
    await page.getByRole('button', { name: 'Oddal', exact: true }).click();
    await expect(page.getByLabel('Stan zapisu')).toContainText('zmieniona w innym miejscu');
    expect((await exportCase(page)).mapView.zoom).toBe(completeFile.mapView.zoom - 1);

    const denied = await stranger.newPage();
    await denied.goto('/cases/' + id);
    await expect(denied.getByRole('alert')).toContainText('Nie znaleziono tej sprawy');
    await denied.goto('/');
    await expect(denied.getByRole('complementary', { name: 'Moje sprawy' })).toContainText(
      'Nie masz jeszcze żadnych spraw',
    );
    expect((await stranger.request.get('/api/cases/' + id)).status()).toBe(404);
    expect((await mutate(stranger, 'PATCH', '/api/cases/' + id, { title: 'Cudza' })).status()).toBe(
      404,
    );
    expect((await mutate(stranger, 'DELETE', '/api/cases/' + id)).status()).toBe(404);

    // Application recreation keeps the PostgreSQL data and applied migrations.
    expect((await request.post(control + '/restart')).ok()).toBe(true);
    await other.reload();
    await expect(other.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
    expect((await exportCase(other)).mapView.zoom).toBe(completeFile.mapView.zoom + 1);
  } finally {
    await Promise.all([first.close(), second.close(), stranger.close()]);
  }
});

test('renames and deletes from My cases with cancellation, confirmation and server failures', async ({
  browser,
  request,
}) => {
  const context = await signedIn(browser, request, 'catalogue');
  try {
    const page = await context.newPage();
    let releaseList = () => undefined as void;
    const listHeld = new Promise<void>((resolve) => (releaseList = resolve));
    await page.route('**/api/cases', async (route) => {
      if (route.request().method() === 'GET') await listHeld;
      await route.fallback();
    });
    await page.goto('/');
    const catalogue = page.getByRole('complementary', { name: 'Moje sprawy' });
    await expect(catalogue).toContainText('Wczytywanie spraw…');
    releaseList();
    await expect(catalogue).toContainText('Nie masz jeszcze żadnych spraw');
    await page.unroute('**/api/cases');

    await createFromCatalogue(page, 'Pierwsza');
    await page.getByRole('link', { name: 'Moje sprawy', exact: true }).click();
    await createFromCatalogue(page, 'Druga');
    await page.getByRole('link', { name: 'Moje sprawy', exact: true }).click();
    await expect(catalogue.getByRole('listitem')).toHaveCount(2);

    await catalogue.getByRole('button', { name: 'Zmień nazwę: Pierwsza', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'Zmiana nazwy sprawy' });
    await dialog.getByLabel('Nazwa sprawy').fill('Nie zapisuj');
    await dialog.getByRole('button', { name: 'Anuluj', exact: true }).click();
    await expect(catalogue.getByRole('link', { name: 'Pierwsza', exact: true })).toBeVisible();
    await catalogue.getByRole('button', { name: 'Zmień nazwę: Pierwsza', exact: true }).click();
    await dialog.getByLabel('Nazwa sprawy').fill('Pierwsza — Kabaty');
    await dialog.getByRole('button', { name: 'Zapisz nazwę', exact: true }).click();
    await expect(
      catalogue.getByRole('link', { name: 'Pierwsza — Kabaty', exact: true }),
    ).toBeVisible();

    await catalogue.getByRole('button', { name: 'Usuń: Druga', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Usunięcie sprawy' });
    await dialog.getByRole('button', { name: 'Anuluj', exact: true }).click();
    await expect(catalogue.getByRole('link', { name: 'Druga', exact: true })).toBeVisible();

    await page.route('**/api/cases/*', (route) =>
      route.request().method() === 'DELETE'
        ? route.fulfill({ status: 503, json: { error: 'database_unavailable' } })
        : route.fallback(),
    );
    await catalogue.getByRole('button', { name: 'Usuń: Druga', exact: true }).click();
    await dialog.getByRole('button', { name: 'Usuń sprawę', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Serwer nie potwierdził operacji');
    await dialog.getByRole('button', { name: 'Anuluj', exact: true }).click();
    await page.unroute('**/api/cases/*');
    await page.reload();
    await expect(catalogue.getByRole('link', { name: 'Druga', exact: true })).toBeVisible();
    await catalogue.getByRole('button', { name: 'Usuń: Druga', exact: true }).click();
    await dialog.getByRole('button', { name: 'Usuń sprawę', exact: true }).click();
    await expect(catalogue.getByRole('link', { name: 'Druga', exact: true })).toHaveCount(0);
    await expect(catalogue.getByRole('listitem')).toHaveCount(1);

    await page.route('**/api/cases', (route) => route.fulfill({ status: 500, json: {} }));
    await page.reload();
    await expect(catalogue.getByRole('alert')).toContainText('Nie udało się wczytać listy spraw');
    await page.unroute('**/api/cases');
    await catalogue.getByRole('button', { name: 'Ponów', exact: true }).click();
    await expect(catalogue.getByRole('listitem')).toHaveCount(1);

    await context.setOffline(true);
    await expect(catalogue).toContainText('Brak połączenia z internetem');
    await expect(
      catalogue.getByRole('button', { name: 'Nowa sprawa', exact: true }),
    ).toBeDisabled();
    await expect(
      catalogue.getByRole('button', { name: 'Usuń: Pierwsza — Kabaty', exact: true }),
    ).toBeDisabled();
    await context.setOffline(false);
    await expect(catalogue.getByRole('button', { name: 'Nowa sprawa', exact: true })).toBeEnabled();
  } finally {
    await context.close();
  }
});

test('shows saving until the server acknowledges and keeps edits recoverable after a failed save', async ({
  browser,
  request,
}) => {
  const context = await signedIn(browser, request, 'autosave');
  try {
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.getByLabel('Stan zapisu')).toHaveText(
      'Wybierz sprawę z listy lub utwórz nową.',
    );
    await createFromCatalogue(page, 'Autozapis');
    let finishRead = () => undefined as void;
    const readHeld = new Promise<void>((resolve) => (finishRead = resolve));
    await page.route('**/api/cases/*', async (route) => {
      if (route.request().method() === 'GET') await readHeld;
      await route.fallback();
    });
    await page.reload();
    await expect(page.getByLabel('Stan zapisu')).toHaveText('Odczytywanie sprawy…');
    finishRead();
    await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
    await page.unroute('**/api/cases/*');
    let release = () => undefined as void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/api/cases/*', async (route) => {
      if (route.request().method() === 'PUT') await held;
      await route.fallback();
    });
    await page.getByRole('button', { name: 'Przybliż', exact: true }).click();
    await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisywanie na serwerze…');
    release();
    await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
    await page.unroute('**/api/cases/*');

    await page.route('**/api/cases/*', (route) =>
      route.request().method() === 'PUT'
        ? route.fulfill({ status: 503, json: { error: 'database_unavailable' } })
        : route.fallback(),
    );
    await page.getByRole('button', { name: 'Przybliż', exact: true }).click();
    await expect(page.getByLabel('Stan zapisu')).toContainText('Nie zapisano zmian na serwerze');
    const zoom = (await exportCase(page)).mapView.zoom;
    await page.unroute('**/api/cases/*');
    await page.getByRole('button', { name: 'Ponów zapis', exact: true }).click();
    await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
    await page.reload();
    await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
    expect((await exportCase(page)).mapView.zoom).toBe(zoom);
  } finally {
    await context.close();
  }
});

test('keeps photos with their owner across direct URLs, a foreign import and an account switch during upload', async ({
  browser,
  request,
}) => {
  test.setTimeout(120_000);
  const owner = await signedIn(browser, request, 'photo-owner');
  const stranger = await signedIn(browser, request, 'photo-stranger');
  const anonymous = await browser.newContext();
  let release = () => undefined as void;
  try {
    const page = await owner.newPage();
    await page.goto('/');
    const caseId = await createFromCatalogue(page, 'Prywatne zdjęcia');
    await page.getByRole('button', { name: 'Edytuj profil', exact: true }).click();
    const uploaded = page.waitForResponse(
      (response) => response.url().endsWith('/assets') && response.request().method() === 'POST',
    );
    await page.getByLabel('Dodaj zdjęcia', { exact: true }).setInputFiles({
      name: 'kot.png',
      mimeType: 'image/png',
      buffer: await readFile(resolve('src/fixtures/photo-detail.png')),
    });
    const { filename } = (await (await uploaded).json()) as { filename: string };
    await expect(
      page.getByRole('button', { name: 'Odepnij ' + filename, exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Zapisz profil', exact: true }).click();
    await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
    const exported = await exportCase(page);

    const photo = `/api/cases/${caseId}/assets/${filename}`;
    expect((await owner.request.get(photo)).status()).toBe(200);
    for (const path of [photo, photo + '/metadata', photo + '/thumbnail', photo + '/preview']) {
      expect((await stranger.request.get(path)).status()).toBe(404);
      expect((await anonymous.request.get(path)).status()).toBe(401);
    }
    expect((await mutate(stranger, 'POST', photo + '/retry')).status()).toBe(404);
    expect((await stranger.request.get('/api/assets/' + filename)).status()).toBe(404);
    expect((await anonymous.request.get('/api/assets/' + filename)).status()).toBe(401);

    // The foreign JSON keeps its reference, but the same name reaches no bytes.
    const foreign = await stranger.newPage();
    await foreign.goto('/');
    const foreignId = await createFromCatalogue(foreign, 'Cudzy import');
    await foreign.getByLabel('Importuj plik JSON').setInputFiles({
      name: 'case.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ ...exported, exportedAt: new Date().toISOString() })),
    });
    await foreign
      .getByRole('dialog', { name: 'Zastąpienie sprawy' })
      .getByRole('button', { name: 'Zastąp sprawę', exact: true })
      .click();
    await expect(foreign.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
    await foreign.getByRole('button', { name: 'Edytuj profil', exact: true }).click();
    await expect(
      foreign
        .getByRole('article', { name: 'Zdjęcie ' + filename, exact: true })
        .getByText('Zdjęcie niedostępne.', { exact: false }),
    ).toBeVisible();

    // The first account leaves while its upload is held; the next account inherits nothing.
    const held = new Promise<void>((resolve) => (release = resolve));
    let received = () => undefined as void;
    const arrived = new Promise<void>((resolve) => (received = resolve));
    await page.route('**/api/cases/*/assets', async (route) => {
      received();
      await held;
      await route.fallback().catch(() => undefined);
    });
    await page.getByRole('button', { name: 'Edytuj profil', exact: true }).click();
    await page.getByLabel('Dodaj zdjęcia', { exact: true }).setInputFiles({
      name: 'late.png',
      mimeType: 'image/png',
      buffer: await readFile(resolve('src/fixtures/photo-detail.png')),
    });
    await arrived;
    await request.post(`${control}/provider?subject=photo-stranger-${run}`);
    await page.getByLabel(/^Konto: /u).click();
    await page.getByRole('menuitem', { name: 'Wyloguj się' }).click();
    await page.getByRole('link', { name: 'Zaloguj się przez Google' }).click();
    await expect(page.getByLabel(/^Konto: /u)).toHaveAttribute(
      'aria-label',
      new RegExp('photo-stranger'),
    );
    await request.post(control + '/provider');
    release();
    const catalogue = page.getByRole('complementary', { name: 'Moje sprawy' });
    // Only the stranger's own case is listed; the import brought the title with it.
    await expect(catalogue.getByRole('link')).toHaveCount(1);
    await catalogue.getByRole('link', { name: 'Prywatne zdjęcia' }).click();
    await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
    expect(page.url()).toContain(foreignId);
    expect((await exportCase(page)).animal?.photos).toEqual([filename]);
  } finally {
    release();
    await owner.close();
    await stranger.close();
    await anonymous.close();
  }
});
