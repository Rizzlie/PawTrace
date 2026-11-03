import { test, createCase, authenticate } from './fixtures';
import { expect, type BrowserContext, type Page } from '@playwright/test';

test.describe.configure({ mode: 'default' });

async function csrfToken(context: BrowserContext) {
  return (await context.cookies()).find((cookie) => cookie.name === 'XSRF-TOKEN')?.value ?? '';
}

async function edit(page: Page, name: string) {
  await page.getByRole('button', { name: 'Edytuj profil', exact: true }).click();
  await page.getByLabel('Imię', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Zapisz profil', exact: true }).click();
}
async function exported(page: Page) {
  await page.getByRole('button', { name: 'Plik JSON', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Eksportuj JSON', exact: true }).click();
  const stream = await (await downloading).createReadStream();
  const parts: Buffer[] = [];
  for await (const part of stream) parts.push(Buffer.from(part));
  return JSON.parse(Buffer.concat(parts).toString());
}
async function logoutDialog(page: Page) {
  await page.getByLabel(/^Konto: /u).click();
  await page.getByRole('menuitem', { name: 'Wyloguj się' }).click();
  return page.getByRole('dialog', { name: 'Wylogowanie i usunięcie lokalnych kopii' });
}
test.beforeEach(async ({ page }) => {
  await page.route('**/api/map-config', (route) => route.fulfill({ json: { mapboxToken: '' } }));
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({ body: '', contentType: 'image/png' }),
  );
});

test('retains two committed case queues in real IndexedDB, survives interruption and reconnects', async ({
  playwright,
  baseURL,
}, testInfo) => {
  const profile = testInfo.outputPath('offline-profile');
  const open = async () => {
    const context = await playwright.chromium.launchPersistentContext(profile, { baseURL });
    await context.addInitScript(() => localStorage.setItem('pawtrace.map-help.seen.v1', 'true'));
    await context.route('**/api/map-config', (route) =>
      route.fulfill({ json: { mapboxToken: '' } }),
    );
    await context.route('https://tile.openstreetmap.org/**', (route) => route.abort());
    return context;
  };
  let context = await open();
  try {
    await authenticate(context);
    const page = await context.newPage();
    const first = await createCase(page, 'Pierwsza offline');
    const second = await createCase(page, 'Druga offline');
    await page.goto(first);
    await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
    await context.setOffline(true);
    await edit(page, 'Lokalna Luna');
    await expect(page.getByLabel('Stan zapisu')).toContainText('Zapisano na urządzeniu');
    expect((await exported(page)).animal.name).toBe('Lokalna Luna');
    // Router navigation keeps the running app alive; offline cold-start is out of scope.
    await page.getByRole('link', { name: 'Moje sprawy', exact: true }).click();
    await page.getByRole('link', { name: 'Druga offline', exact: true }).click();
    await edit(page, 'Lokalny Burek');
    await expect(page.getByLabel('Stan zapisu')).toContainText('Zapisano na urządzeniu');
    expect(
      await page.evaluate(async () => (await indexedDB.databases()).map((db) => db.name)),
    ).toContain('pawtrace.owned-cases');
    await context.close();
    context = await open();
    const reopened = await context.newPage();
    await reopened.goto(second);
    await expect(reopened.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
    expect((await exported(reopened)).animal.name).toBe('Lokalny Burek');
    await reopened.goto(first);
    await expect(reopened.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
    expect((await exported(reopened)).animal.name).toBe('Lokalna Luna');
  } finally {
    await context.close();
  }
});

test('background retry cannot overwrite a newer acknowledged edit in another case', async ({
  page,
  context,
}) => {
  const first = await createCase(page, 'Retry A');
  const second = await createCase(page, 'Retry B');
  await page.goto(first);
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
  await context.setOffline(true);
  await edit(page, 'Pending A');
  await expect(page.getByLabel('Stan zapisu')).toContainText('Zapisano na urządzeniu');
  await page.getByRole('link', { name: 'Moje sprawy', exact: true }).click();
  await page.locator(`a[href="${second}"]`).click();
  await edit(page, 'Old B');
  await expect(page.getByLabel('Stan zapisu')).toContainText('Zapisano na urządzeniu');
  await page.getByRole('link', { name: 'Moje sprawy', exact: true }).click();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let arrived!: () => void;
  const waiting = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  await page.route('**/api' + first, async (route) => {
    if (route.request().method() !== 'PUT') return route.fallback();
    arrived();
    await held;
    await route.continue();
  });
  await context.setOffline(false);
  await waiting; // The bounded pass captured A and B, and is now waiting on A.
  await page.locator(`a[href="${second}"]`).click();
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
  await edit(page, 'Newest acknowledged B');
  await expect
    .poll(
      async () => (await (await context.request.get('/api' + second)).json()).document.animal.name,
    )
    .toBe('Newest acknowledged B');
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
  const acknowledged = await (await context.request.get('/api' + second)).json();
  expect(acknowledged.document.animal.name).toBe('Newest acknowledged B');
  release();
  await expect
    .poll(async () => (await (await context.request.get('/api' + first)).json()).version)
    .toBe(2);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const locks = await navigator.locks.query();
        return [...(locks.held ?? []), ...(locks.pending ?? [])].filter((lock) =>
          lock.name?.startsWith('pawtrace.sync.'),
        ).length;
      }),
    )
    .toBe(0);
  const final = await (await context.request.get('/api' + second)).json();
  expect(final.document.animal.name).toBe('Newest acknowledged B');
  expect(final.version).toBe(acknowledged.version);
  expect((await exported(page)).animal.name).toBe('Newest acknowledged B');
});

test('coalesces foreground edits while a background retry acknowledgement is in flight', async ({
  page,
  context,
}) => {
  const path = await createCase(page, 'Foreground joins retry');
  await context.setOffline(true);
  await edit(page, 'Background captured');
  await expect(page.getByLabel('Stan zapisu')).toContainText('Zapisano na urządzeniu');
  await page.getByRole('link', { name: 'Moje sprawy', exact: true }).click();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let arrived!: () => void;
  const committed = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  let first = true;
  await page.route('**/api' + path, async (route) => {
    if (route.request().method() !== 'PUT' || !first) return route.fallback();
    first = false;
    const response = await route.fetch();
    arrived();
    await held;
    await route.fulfill({ response });
  });
  await context.setOffline(false);
  await committed;
  await page.locator(`a[href="${path}"]`).click();
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await navigator.locks.query()).pending?.filter((lock) =>
            lock.name?.startsWith('pawtrace.sync.'),
          ).length,
      ),
    )
    .toBe(1);
  await edit(page, 'Latest foreground');
  expect((await exported(page)).animal.name).toBe('Latest foreground');
  release();
  await expect
    .poll(
      async () => (await (await context.request.get('/api' + path)).json()).document.animal.name,
    )
    .toBe('Latest foreground');
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
});

test('coalesces newer edits after a lost acknowledgement using the real committed mutation', async ({
  page,
}) => {
  const path = await createCase(page, 'Utracona odpowiedź');
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let arrived!: () => void;
  const committed = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  let first = true;
  let allowRetry = false;
  await page.route('**/api/cases/*', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.fallback();
      return;
    }
    if (!first) {
      if (allowRetry) await route.fallback();
      else await route.fulfill({ status: 503, json: { error: 'interrupted' } });
      return;
    }
    first = false;
    await route.fetch(); // Real PostGIS commit; lose only its response.
    arrived();
    await held;
    await route.abort();
  });
  await edit(page, 'Wysłana Luna');
  await committed;
  await edit(page, 'Najnowsza Luna');
  release();
  await expect(page.getByLabel('Stan zapisu')).toContainText('Serwer nie potwierdził');
  expect((await exported(page)).animal.name).toBe('Najnowsza Luna');
  allowRetry = true;
  await page.getByRole('button', { name: 'Ponów zapis', exact: true }).click();
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
  const server = await page.request.get('/api' + path);
  expect((await server.json()).document.animal.name).toBe('Najnowsza Luna');
});

test('retains divergent offline tab branches and pauses both with export available', async ({
  page,
  context,
}) => {
  const path = await createCase(page, 'Dwie karty');
  const other = await context.newPage();
  await other.goto(path);
  await expect(other.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
  await page.getByRole('button', { name: 'Edytuj profil', exact: true }).click();
  await other.getByRole('button', { name: 'Edytuj profil', exact: true }).click();
  await context.setOffline(true);
  for (const [tab, name] of [
    [page, 'Gałąź A'],
    [other, 'Gałąź B'],
  ] as const) {
    await tab.getByLabel('Imię', { exact: true }).fill(name);
    await tab.getByRole('button', { name: 'Zapisz profil', exact: true }).click();
    await expect(tab.getByLabel('Stan zapisu')).toContainText('Zapisano na urządzeniu');
  }
  await context.setOffline(false);
  await expect(page.getByLabel('Stan zapisu')).toContainText('Synchronizacja wstrzymana');
  await expect(other.getByLabel('Stan zapisu')).toContainText('Synchronizacja wstrzymana');
  expect((await exported(page)).animal.name).toBe('Gałąź A');
  expect((await exported(other)).animal.name).toBe('Gałąź B');
  expect((await (await page.request.get('/api' + path)).json()).version).toBe(1);
  await other.close();
});

test('keeps memory and export on quota failure without sending an undurable revision', async ({
  page,
}) => {
  const path = await createCase(page, 'Pełne urządzenie');
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    Object.assign(globalThis, {
      restoreP04Storage: () => {
        IDBObjectStore.prototype.put = put;
      },
    });
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      if (this.name === 'copies') throw new DOMException('Full device', 'QuotaExceededError');
      return put.call(this, value, key);
    };
  });
  await edit(page, 'Luna tylko w pamięci');
  await expect(page.getByLabel('Stan zapisu')).toContainText('Nie zapisano na urządzeniu');
  expect((await exported(page)).animal.name).toBe('Luna tylko w pamięci');
  expect((await (await page.request.get('/api' + path)).json()).version).toBe(1);
  await page.evaluate(() => Reflect.get(globalThis, 'restoreP04Storage')());
  await page.getByRole('button', { name: 'Ponów zapis', exact: true }).click();
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
});

test('opens the latest server document with a persistent warning when clean-cache refresh cannot be stored', async ({
  page,
  context,
}) => {
  const path = await createCase(page, 'Clean cache refresh');
  await page.getByRole('link', { name: 'Moje sprawy', exact: true }).click();
  const old = await (await context.request.get('/api' + path)).json();
  const document = {
    ...old.document,
    animal: { ...old.document.animal, name: 'Latest committed remote' },
  };
  expect(
    (
      await context.request.put('/api' + path, {
        data: { document },
        headers: {
          origin: 'http://127.0.0.1:4200',
          'x-xsrf-token': await csrfToken(context),
          'if-match': '"1"',
          'idempotency-key': crypto.randomUUID(),
        },
      })
    ).status(),
  ).toBe(200);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    Object.assign(globalThis, {
      restoreRefreshStorage: () => {
        IDBObjectStore.prototype.put = put;
      },
    });
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === 'copies')
        throw new DOMException('Cannot refresh cache', 'QuotaExceededError');
      return put.call(this, value, key);
    };
  });
  await page.locator(`a[href="${path}"]`).click();
  expect((await exported(page)).animal?.name).toBe('Latest committed remote');
  await expect(page.getByLabel('Stan zapisu')).toContainText('Nie zapisano na urządzeniu');
  await edit(page, 'Latest local after failed refresh');
  expect((await exported(page)).animal.name).toBe('Latest local after failed refresh');
  await expect(page.getByLabel('Stan zapisu')).toContainText('Nie zapisano na urządzeniu');
  await page.evaluate(() => Reflect.get(globalThis, 'restoreRefreshStorage')());
  await page.getByRole('button', { name: 'Ponów zapis', exact: true }).click();
  await expect
    .poll(
      async () => (await (await context.request.get('/api' + path)).json()).document.animal.name,
    )
    .toBe('Latest local after failed refresh');
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
});

test('preserves expired-session work, resumes only for the same account and hides it from another account', async ({
  page,
  context,
  request,
}) => {
  const path = await createCase(page, 'Odzyskanie po wygaśnięciu');
  const eightDays = 8 * 24 * 60 * 60 * 1000;
  let advanced = 0;
  try {
    await context.setOffline(true);
    await edit(page, 'Luna po wygaśnięciu');
    await expect(page.getByLabel('Stan zapisu')).toContainText('Zapisano na urządzeniu');
    await request.post('http://127.0.0.1:3902/advance?ms=' + eightDays);
    advanced += eightDays;
    await context.setOffline(false);
    await expect(page.getByText('Sesja wygasła.', { exact: false })).toBeVisible();
    await page.getByRole('link', { name: 'Zaloguj się przez Google' }).click();
    await page.locator(`a[href="${path}"]`).click();
    await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
    expect((await exported(page)).animal.name).toBe('Luna po wygaśnięciu');
    await context.setOffline(true);
    await edit(page, 'Tylko konto Alice');
    await expect(page.getByLabel('Stan zapisu')).toContainText('Zapisano na urządzeniu');
    await request.post('http://127.0.0.1:3902/advance?ms=' + eightDays);
    advanced += eightDays;
    await context.setOffline(false);
    await expect(page.getByRole('link', { name: 'Zaloguj się przez Google' })).toBeVisible();
    await request.post('http://127.0.0.1:3902/provider?subject=p04-other-' + Date.now());
    await page.getByRole('link', { name: 'Zaloguj się przez Google' }).click();
    await expect(
      page.getByRole('complementary', { name: 'Moje sprawy' }).getByRole('link'),
    ).toHaveCount(0);
    expect((await context.request.get('/api' + path)).status()).toBe(404);
    await expect(page.getByRole('button', { name: 'Edytuj profil', exact: true })).toBeDisabled();
  } finally {
    await request.post('http://127.0.0.1:3902/provider');
    await request.post('http://127.0.0.1:3902/advance?ms=' + -advanced);
  }
});

test('retains recovery on failed revocation and cancellation, then clears all tabs despite a late acknowledgement', async ({
  page,
  context,
}) => {
  const path = await createCase(page, 'Świadome wylogowanie');
  const other = await context.newPage();
  await other.goto(path);
  await expect(other.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let arrived!: () => void;
  const committed = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  await page.route('**/api/cases/*', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.fallback();
      return;
    }
    const response = await route.fetch();
    arrived();
    await held;
    await route.fulfill({ response }).catch(() => undefined);
  });
  await edit(page, 'Zachowaj przed wylogowaniem');
  await committed;
  await other.route('**/api/auth/logout', (route) =>
    route.fulfill({ status: 503, json: { error: 'unavailable' } }),
  );
  const dialog = await logoutDialog(other);
  await dialog.getByRole('button', { name: 'Anuluj wylogowanie', exact: true }).click();
  expect((await context.request.get('/api/auth/me')).status()).toBe(200);
  await logoutDialog(other);
  await other.getByRole('button', { name: 'Potwierdź wylogowanie', exact: true }).click();
  await expect(
    other.getByText('Serwer nie potwierdził wylogowania.', { exact: false }),
  ).toBeVisible();
  expect((await context.request.get('/api/auth/me')).status()).toBe(200);
  await other.unroute('**/api/auth/logout');
  await other.getByRole('button', { name: 'Potwierdź wylogowanie', exact: true }).click();
  await expect(other.getByRole('link', { name: 'Zaloguj się przez Google' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Zaloguj się przez Google' })).toBeVisible();
  release();
  expect((await context.request.get('/api/auth/me')).status()).toBe(401);
  const remaining = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('pawtrace.owned-cases', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const copies = await new Promise<unknown[]>((resolve, reject) => {
      const request = db.transaction('copies').objectStore('copies').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return copies;
  });
  expect(remaining).toEqual([]);
  await other.close();
});

test('keeps access closed and reports device cleanup failure after actual server revocation', async ({
  page,
  context,
}) => {
  await createCase(page, 'Awaria usuwania kopii');
  await page.evaluate(() => {
    const remove = IDBObjectStore.prototype.delete;
    Object.assign(globalThis, {
      restoreP04Delete: () => {
        IDBObjectStore.prototype.delete = remove;
      },
    });
    IDBObjectStore.prototype.delete = function (key: IDBValidKey | IDBKeyRange) {
      if (this.name === 'copies') throw new DOMException('Device failure', 'UnknownError');
      return remove.call(this, key);
    };
  });
  await logoutDialog(page);
  await page.getByRole('button', { name: 'Potwierdź wylogowanie', exact: true }).click();
  await expect(page.getByText('Sesja została odwołana.', { exact: false })).toBeVisible();
  expect((await context.request.get('/api/auth/me')).status()).toBe(401);
  await expect(page.getByRole('link', { name: 'Zaloguj się przez Google' })).toHaveCount(0);
  // Even obtaining a new valid session cannot bypass unfinished device cleanup.
  await context.request.get('/api/auth/login');
  await page.reload();
  await expect(page.getByText('Sesja została odwołana.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Ponów usuwanie lokalnych kopii', exact: true }).click();
  await expect(page.getByLabel(/^Konto: /u)).toBeVisible();
});

test('localStorage quota failure still durably fences failed logout cleanup after reauthentication and reload', async ({
  page,
  context,
}) => {
  await createCase(page, 'Early logout marker failure');
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('pawtrace.logout-cleanup.'))
        throw new DOMException('Full localStorage', 'QuotaExceededError');
      return set.call(this, key, value);
    };
    const remove = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete = function (key) {
      if (this.name === 'copies') throw new DOMException('Deletion failed', 'UnknownError');
      return remove.call(this, key);
    };
  });
  await logoutDialog(page);
  await page.getByRole('button', { name: 'Potwierdź wylogowanie', exact: true }).click();
  await expect(page.getByText('Sesja została odwołana.', { exact: false })).toBeVisible();
  expect((await context.request.get('/api/auth/me')).status()).toBe(401);
  await context.request.get('/api/auth/login');
  await page.reload();
  await expect(page.getByText('Sesja została odwołana.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edytuj profil', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Ponów usuwanie lokalnych kopii', exact: true }).click();
  await expect(page.getByLabel(/^Konto: /u)).toBeVisible();
});

for (const unavailable of ['localStorage', 'owner fence'] as const) {
  test(`logout deletes pending copies despite a failed ${unavailable} marker`, async ({
    page,
    context,
  }) => {
    const path = await createCase(page, 'Independent logout storage');
    await page.route('**/api' + path, (route) =>
      route.request().method() === 'PUT'
        ? route.fulfill({ status: 503, json: { error: 'unavailable' } })
        : route.fallback(),
    );
    await edit(page, 'Pending copy to remove');
    await expect(page.getByLabel('Stan zapisu')).toContainText('Serwer nie potwierdził');
    await page.evaluate((unavailable) => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (unavailable === 'localStorage' && key.startsWith('pawtrace.logout-cleanup.'))
          throw new DOMException('Full localStorage', 'QuotaExceededError');
        return set.call(this, key, value);
      };
      const put = IDBObjectStore.prototype.put;
      let fail = unavailable === 'owner fence';
      IDBObjectStore.prototype.put = function (value, key) {
        if (fail && this.name === 'owners') {
          fail = false;
          throw new DOMException('Owner fence failed', 'UnknownError');
        }
        return put.call(this, value, key);
      };
    }, unavailable);
    await logoutDialog(page);
    await page.getByRole('button', { name: 'Potwierdź wylogowanie', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Zaloguj się przez Google' })).toBeVisible();
    expect((await context.request.get('/api/auth/me')).status()).toBe(401);
    await context.request.get('/api/auth/login');
    await page.goto(path);
    await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
    expect((await exported(page)).animal).toBeNull();
  });
}

test('pauses a remotely deleted case and preserves the local JSON without recreating it', async ({
  page,
  context,
}) => {
  const path = await createCase(page, 'Usunięta zdalnie');
  await context.setOffline(true);
  await edit(page, 'Odzyskaj usuniętą');
  await expect(page.getByLabel('Stan zapisu')).toContainText('Zapisano na urządzeniu');
  const csrf = await csrfToken(context);
  const deletion = await context.request.delete('/api' + path, {
    headers: {
      origin: 'http://127.0.0.1:4200',
      'x-xsrf-token': csrf,
      'if-match': '"1"',
      'idempotency-key': crypto.randomUUID(),
    },
  });
  expect(deletion.status()).toBe(204);
  await context.setOffline(false);
  await expect(page.getByLabel('Stan zapisu')).toContainText('Synchronizacja wstrzymana');
  expect((await exported(page)).animal.name).toBe('Odzyskaj usuniętą');
  expect((await context.request.get('/api' + path)).status()).toBe(404);
});

test('does not use a replayed acknowledgement to overwrite a newer server version', async ({
  page,
  context,
}) => {
  const path = await createCase(page, 'Historyczne potwierdzenie');
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let arrived!: () => void;
  const committed = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  let drop = true;
  await page.route('**/api/cases/*', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.fallback();
      return;
    }
    if (!drop) {
      await route.fulfill({ status: 503, json: { error: 'interrupted' } });
      return;
    }
    drop = false;
    await route.fetch();
    arrived();
    await held;
    await route.abort();
  });
  await edit(page, 'Wysłana wersja');
  await committed;
  await edit(page, 'Nowsza lokalna wersja');
  const current = await (await context.request.get('/api' + path)).json();
  const remote = {
    ...current.document,
    animal: { ...current.document.animal, name: 'Nowsza zdalna wersja' },
  };
  const csrf = await csrfToken(context);
  expect(
    (
      await context.request.put('/api' + path, {
        data: { document: remote },
        headers: {
          origin: 'http://127.0.0.1:4200',
          'x-xsrf-token': csrf,
          'if-match': '"2"',
          'idempotency-key': crypto.randomUUID(),
        },
      })
    ).status(),
  ).toBe(200);
  release();
  await expect(page.getByLabel('Stan zapisu')).toContainText('Serwer nie potwierdził');
  await page.unroute('**/api/cases/*');
  await page.getByRole('button', { name: 'Ponów zapis', exact: true }).click();
  await expect(page.getByLabel('Stan zapisu')).toContainText('Synchronizacja wstrzymana');
  expect((await exported(page)).animal.name).toBe('Nowsza lokalna wersja');
  expect((await (await context.request.get('/api' + path)).json()).document.animal.name).toBe(
    'Nowsza zdalna wersja',
  );
});

test('recovers from an actual aborted IndexedDB transaction while keeping the latest JSON', async ({
  page,
}) => {
  await createCase(page, 'Przerwana transakcja');
  await page.evaluate(() => {
    const transaction = IDBDatabase.prototype.transaction;
    Object.assign(globalThis, {
      restoreP04Transaction: () => {
        IDBDatabase.prototype.transaction = transaction;
      },
    });
    IDBDatabase.prototype.transaction = function (stores, mode, options) {
      const active = transaction.call(this, stores, mode, options);
      if (
        mode === 'readwrite' &&
        Array.from(typeof stores === 'string' ? [stores] : stores).includes('copies')
      )
        queueMicrotask(() => active.abort());
      return active;
    };
  });
  await edit(page, 'Luna po przerwaniu');
  await expect(page.getByLabel('Stan zapisu')).toContainText('Nie zapisano na urządzeniu');
  expect((await exported(page)).animal.name).toBe('Luna po przerwaniu');
  await page.evaluate(() => Reflect.get(globalThis, 'restoreP04Transaction')());
  await page.getByRole('button', { name: 'Ponów zapis', exact: true }).click();
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
});

test('renames a cached case offline through the durable committed queue', async ({
  page,
  context,
}) => {
  const path = await createCase(page, 'Nazwa przed odłączeniem');
  await page.getByRole('link', { name: 'Moje sprawy', exact: true }).click();
  const link = page.locator(`a[href="${path}"]`);
  await expect(link).toBeVisible();
  await context.setOffline(true);
  await page
    .getByRole('listitem')
    .filter({ has: link })
    .getByRole('button', { name: 'Zmień nazwę: Nazwa przed odłączeniem', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Zmiana nazwy sprawy' });
  await dialog.getByLabel('Nazwa sprawy').fill('Nazwa zapisana offline');
  await dialog.getByRole('button', { name: 'Zapisz nazwę', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(link).toHaveText('Nazwa zapisana offline');
  await context.setOffline(false);
  await expect
    .poll(async () => (await (await context.request.get('/api' + path)).json()).document.case.title)
    .toBe('Nazwa zapisana offline');
});

test('restores the routed case after a delayed initial identity response', async ({ page }) => {
  const path = await createCase(page, 'Opóźniona tożsamość');
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/auth/me', async (route) => {
    const response = await route.fetch();
    await held;
    await route.fulfill({ response });
  });
  await page.reload();
  await expect(page.getByText('Sprawdzanie sesji…', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Mapa poszukiwań' })).toHaveCount(0);
  release();
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
  await expect(page).toHaveURL(new RegExp(path + '$'));
  expect((await exported(page)).case.title).toBe('Opóźniona tożsamość');
});
