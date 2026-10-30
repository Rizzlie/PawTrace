import { expect, test as base, type BrowserContext, type Page } from '@playwright/test';

export async function authenticate(context: BrowserContext) {
  const me = await context.request.get('/api/auth/me');
  if (me.status() === 401) {
    const response = await context.request.get('/api/auth/login');
    if (!response.ok() || !response.url().endsWith('/'))
      throw new Error('Controlled OIDC login failed');
  }
}

/** Feature tests start after onboarding; first-visit behavior has its own suite. */
export const authenticatedTest = base.extend({
  context: async ({ context }, use) => {
    await authenticate(context);
    await use(context);
  },
});
export const test = authenticatedTest.extend<{ mapHelpSeen: void }>({
  mapHelpSeen: [
    async ({ context }, use) => {
      await context.addInitScript(() => localStorage.setItem('pawtrace.map-help.seen.v1', 'true'));
      await use();
    },
    { auto: true },
  ],
});

/** Creates a private server case through My cases and waits for the server acknowledgement. */
export async function createCase(page: Page, title = 'Nowa sprawa', navigate = true) {
  if (navigate) await page.goto('/');
  await page.getByRole('button', { name: 'Nowa sprawa', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nowa sprawa' });
  await dialog.getByLabel('Nazwa sprawy').fill(title);
  await dialog.getByRole('button', { name: 'Utwórz sprawę', exact: true }).click();
  await expect(page).toHaveURL(/\/cases\/[0-9a-f-]{36}$/u);
  await expect(page.getByLabel('Stan zapisu')).toHaveText('Zapisano na serwerze');
  return new URL(page.url()).pathname;
}

/** Location of an open case workspace (no routed panel). */
export const caseLocation = /\/cases\/[0-9a-f-]{36}$/u;

/** Starts replacing the open case from a JSON file, which first resolves any dirty editor. */
export async function chooseReplacement(page: Page, file: unknown) {
  await page.getByLabel('Importuj plik JSON').setInputFiles({
    name: 'case.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  });
}
