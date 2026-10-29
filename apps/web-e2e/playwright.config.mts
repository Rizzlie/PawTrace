import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';

const baseURL = process.env['BASE_URL'] || 'http://127.0.0.1:4200';

export default defineConfig({
  ...nxE2EPreset(import.meta.dirname, { testDir: './src' }),
  use: { baseURL, trace: 'on-first-retry' },
  webServer: process.env['BASE_URL']
    ? undefined
    : [
        {
          command: 'npm exec nx run api:auth-test-host',
          url: baseURL + '/api/ready',
          timeout: 180_000,
          reuseExistingServer: false,
          cwd: workspaceRoot,
        },
      ],
  projects: [
    {
      name: 'authentication',
      testMatch: /authentication\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium',
      testIgnore: /authentication\.spec\.ts$/,
      dependencies: ['authentication'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
