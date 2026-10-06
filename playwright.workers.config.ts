import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Esta suite interactiva sólo se ejecuta sobre Workers con datos sintéticos.
// La lectura del catálogo real tiene su propia configuración public.
const origin = process.env.WORKERS_QA_ORIGIN ?? 'http://127.0.0.1:3106';
const target = new URL(origin);
const local = ['127.0.0.1', 'localhost'].includes(target.hostname);
const remoteQa = target.origin === 'https://hardware-ar-qa-20261005.ortiz-jonathan.workers.dev';
if (!local && !remoteQa) throw new Error('Workers E2E requires the isolated synthetic QA origin');
if (target.username || target.password || target.search || target.hash || target.pathname !== '/') {
  throw new Error('Workers E2E requires an origin without credentials or a path');
}

const outputDir = process.env.WORKERS_QA_OUTPUT_DIR ?? 'outputs/workers-e2e';
const reportFile = process.env.WORKERS_QA_REPORT_FILE ?? `${outputDir}/results.json`;
export default defineConfig({
  ...base,
  testDir: './e2e',
  outputDir,
  reporter: [['json', { outputFile: reportFile }], ['line']],
  webServer: undefined,
  use: { ...base.use, baseURL: target.origin, trace: 'retain-on-failure' },
});
