import { test as base, type BrowserContext } from '@playwright/test';

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
