import { test as base } from '@playwright/test';

/** Feature tests start after onboarding; first-visit behavior has its own suite. */
export const test = base.extend<{ mapHelpSeen: void }>({
  mapHelpSeen: [
    async ({ context }, use) => {
      await context.addInitScript(() => localStorage.setItem('pawtrace.map-help.seen.v1', 'true'));
      await use();
    },
    { auto: true },
  ],
});
