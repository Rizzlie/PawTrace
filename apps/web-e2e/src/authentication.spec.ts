import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:3902/provider');
});

test('keeps a signed session across reload, browser-profile reopen and API restart; logout revokes a saved private URL', async ({
  playwright,
  baseURL,
  request,
}, testInfo) => {
  const profile = testInfo.outputPath('session-profile');
  const open = () => playwright.chromium.launchPersistentContext(profile, { baseURL });
  let context = await open();
  try {
    await context.addInitScript(() => localStorage.setItem('pawtrace.map-help.seen.v1', 'true'));
    await context.route('https://tile.openstreetmap.org/**', (route) => route.abort());
    let page = await context.newPage();
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Zaloguj się przez Google' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Mapa poszukiwań' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Zaloguj się przez Google' }).click();
    await expect(page.getByLabel('Konto')).toHaveAttribute(
      'aria-label',
      'Konto: alice@example.test',
    );
    await expect(page.getByRole('region', { name: 'Mapa poszukiwań' })).toBeVisible();
    const credentials = (await context.cookies()).filter((cookie) => cookie.name === 'pawtrace');
    expect(credentials).toHaveLength(1);
    expect(credentials[0].httpOnly).toBe(true);
    expect(credentials[0].expires).toBeGreaterThan(Date.now() / 1000 + 600_000);
    const storage = await page.evaluate(() => ({
      local: { ...localStorage },
      session: { ...sessionStorage },
      cookie: document.cookie,
    }));
    expect(storage.cookie).not.toContain('pawtrace=');
    expect(JSON.stringify(storage)).not.toContain(credentials[0].value);
    await page.reload();
    await expect(page.getByLabel('Konto')).toHaveAttribute(
      'aria-label',
      'Konto: alice@example.test',
    );
    await context.close();
    context = await open();
    await context.route('https://tile.openstreetmap.org/**', (route) => route.abort());
    page = await context.newPage();
    await page.goto('/');
    await expect(page.getByLabel('Konto')).toHaveAttribute(
      'aria-label',
      'Konto: alice@example.test',
    );
    expect((await request.post('http://127.0.0.1:3902/restart')).ok()).toBe(true);
    await page.reload();
    await expect(page.getByLabel('Konto')).toHaveAttribute(
      'aria-label',
      'Konto: alice@example.test',
    );
    const old = await context.storageState();
    await page.getByLabel('Konto: alice@example.test', { exact: true }).click();
    await page.getByRole('menuitem', { name: 'Wyloguj się' }).click();
    await expect(page.getByRole('link', { name: 'Zaloguj się przez Google' })).toBeVisible();
    expect((await context.request.get('/api/map-config')).status()).toBe(401);
    const replay = await playwright.request.newContext({ baseURL, storageState: old });
    expect((await replay.get('/api/auth/me')).status()).toBe(401);
    await replay.dispose();
  } finally {
    await context.close();
  }
});

test('renders recoverable cancelled/failed login states and hides the shell after server expiry', async ({
  page,
  request,
}) => {
  await page.addInitScript(() => localStorage.setItem('pawtrace.map-help.seen.v1', 'true'));
  for (const [query, message] of [
    ['fault=cancel', 'Logowanie anulowane'],
    ['fault=signature', 'Logowanie nie powiodło się'],
    ['verified=false', 'To konto nie ma dostępu'],
  ] as const) {
    await request.post('http://127.0.0.1:3902/provider?' + query);
    await page.goto('/api/auth/login');
    await expect(page.getByRole('status')).toContainText(message);
    await expect(page.getByLabel('Konto')).toHaveCount(0);
  }
  await request.post('http://127.0.0.1:3902/provider');
  await page.goto('/api/auth/login');
  await expect(page.getByLabel('Konto')).toHaveAttribute('aria-label', 'Konto: alice@example.test');
  await request.post('http://127.0.0.1:3902/advance?ms=604800000');
  await page.reload();
  await expect(page.getByRole('status')).toContainText('Sesja wygasła');
  await expect(page.getByRole('region', { name: 'Mapa poszukiwań' })).toHaveCount(0);
});
