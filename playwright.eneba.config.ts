import { defineConfig } from '@playwright/test';
import base from './playwright.config';

const webServer = base.webServer;
if (!webServer || Array.isArray(webServer)) throw new Error('El piloto requiere el servidor E2E del proyecto');

export default defineConfig({
  ...base,
  testMatch: ['eneba-pilot.spec.ts', 'analytics-consent.spec.ts'],
  webServer: {
    ...webServer,
    env: { ...webServer.env, ENEBA_AFFILIATE_PILOT_ENABLED: '1' },
  },
});
