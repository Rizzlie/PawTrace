import { defineConfig, devices } from "@playwright/test";
import { nxE2EPreset } from "@nx/playwright/preset";
import { workspaceRoot } from "@nx/devkit";

const baseURL = process.env["BASE_URL"] || "http://127.0.0.1:4200";

export default defineConfig({
  ...nxE2EPreset(import.meta.dirname, { testDir: "./src" }),
  use: { baseURL, trace: "on-first-retry" },
  webServer: process.env["BASE_URL"]
    ? undefined
    : [
        {
          command: "npx nx run api:serve",
          url: "http://127.0.0.1:3000/api/health",
          reuseExistingServer: false,
          cwd: workspaceRoot,
        },
        {
          command: "npx nx run web:serve",
          url: baseURL,
          reuseExistingServer: false,
          cwd: workspaceRoot,
        },
      ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
