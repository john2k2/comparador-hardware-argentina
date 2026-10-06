import { defineConfig, devices } from '@playwright/test';

// Suite pública de lectura; no levanta servidor ni carga credenciales locales.
export default defineConfig({
  testDir: './e2e-public', outputDir: process.env.PUBLIC_QA_OUTPUT_DIR ?? './testsprite_tests/public-browser-artifacts', timeout: 60000, workers: 1, retries: 0,
  expect: { timeout: 15000 },
  use: { baseURL: process.env.PUBLIC_QA_ORIGIN ?? 'https://www.comparador-hardware.com.ar', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'mobile', use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 390, height: 844 } } },
  ],
});
