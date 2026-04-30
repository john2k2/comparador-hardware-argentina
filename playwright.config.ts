import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run build && npx cross-env PORT=3100 npm run start',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_TELEMETRY_DISABLED: '1',
      DISABLE_INTERNAL_BACKGROUND_REFRESH: '1',
      DISABLE_LIVE_SCRAPING: '1',
      E2E_STABLE_MODE: '1',
      CI_E2E: '1',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
      },
    },
  ],
});
