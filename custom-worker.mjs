import handler from './.open-next/worker.js';
import { observeCatalogSchedule } from './src/lib/catalog/scheduler.ts';
import { createScanGuard } from './src/lib/server/scan-guard.ts';

// Conservar el transporte nativo: Next adapta el global durante peticiones HTTP.
const scheduledFetch = globalThis.fetch.bind(globalThis);

const worker = {
  ...handler,
  fetch: createScanGuard((request, env, context) => handler.fetch(request, env, context)),
  async scheduled(_event, env) {
    await observeCatalogSchedule(env, scheduledFetch);
  },
};

export default worker;

export * from './.open-next/worker.js';
