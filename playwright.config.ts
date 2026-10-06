import { defineConfig, devices } from "@playwright/test";

import { loadLocalEnv } from "./tests/e2e/env";

// Port 3000: the local Supabase Send-SMS hook calls http://host.docker.internal:3000 (supabase/.env).
const PORT = 3000;
const localEnv = loadLocalEnv();
for (const [k, v] of Object.entries(localEnv)) process.env[k] ??= v;

// In the cloud dev container the preinstalled Chromium differs from Playwright's pinned revision.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: { executablePath },
  },
  projects: [
    {
      name: "mobile",
      testMatch: /.*\.mobile\.spec\.ts/,
      use: {
        ...devices["Pixel 7"],
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "admin",
      testMatch: /.*\.admin\.spec\.ts/,
      use: { browserName: "chromium", viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: `pnpm start --port ${PORT} --hostname 0.0.0.0`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...localEnv,
      ENABLE_UI_KIT: "1",
      // Tests inject x-vercel-ip-country to exercise the geo pre-filter. Never set on Vercel.
      GEO_TRUST_HEADER: "1",
    },
  },
});
