import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// La candidata se compila una vez con OpenNext antes de iniciar esta batería.
export default defineConfig(base, {
  testMatch: ['confidence-first-delivery.spec.ts', 'comparison-return.spec.ts', 'component-identity.spec.ts', 'pc-builder.spec.ts', 'product-detail.spec.ts', 'product-detail-full.spec.ts', 'csp-hydration.spec.ts'],
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'tmp/confianza/e2e-result.json' }]],
  use: { baseURL: 'http://127.0.0.1:3141' },
  webServer: {
    command: 'npx cross-env PORT=3141 npm run start',
    url: 'http://127.0.0.1:3141',
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      NEXT_TELEMETRY_DISABLED: '1',
      DISABLE_INTERNAL_BACKGROUND_REFRESH: '1',
      DISABLE_LIVE_SCRAPING: '1',
      ENABLE_ON_DEMAND_REFRESH: '0',
      SUPABASE_SECRET_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '',
      CRON_SECRET: '', CATALOG_REFRESH_CRON_SECRET: '',
      NEXT_PUBLIC_GA4_MEASUREMENT_ID: 'G-QA123456',
      E2E_STABLE_MODE: '1', CI_E2E: '1',
    },
  },
});
