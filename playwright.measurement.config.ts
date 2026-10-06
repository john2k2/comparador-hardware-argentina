import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', testMatch: 'measurement-dashboard.spec.ts', fullyParallel: false, workers: 1, timeout: 45_000,
  expect: { timeout: 10_000 },
  use: { baseURL: 'http://127.0.0.1:3132', trace: 'retain-on-failure' },
  webServer: { command: 'node scripts/measurement-fixture-server.mjs --build && node scripts/measurement-fixture-server.mjs', url: 'http://127.0.0.1:3132/auth', reuseExistingServer: false, timeout: 120_000 },
  projects: [{ name: 'measurement-chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
});
