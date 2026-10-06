import handler from './.open-next/worker.js';
import { observeCatalogSchedule } from './src/lib/catalog/scheduler.ts';
import { createScanGuard } from './src/lib/server/scan-guard.ts';
import { createPublicDocumentCache } from './src/lib/server/public-document-cache.ts';
import { handleMeasurementEdgeRead } from './src/lib/measurement/edge-read.ts';

// Conservar el transporte nativo: Next adapta el global durante peticiones HTTP.
const scheduledFetch = globalThis.fetch.bind(globalThis);
const publicFetch = createPublicDocumentCache((request, env, context) => handler.fetch(request, env, context));

const worker = {
  ...handler,
  fetch: createScanGuard(async (request, env, context) => {
    const measurement = await handleMeasurementEdgeRead(request, env, scheduledFetch);
    return measurement ?? publicFetch(request, env, context);
  }),
  async scheduled(_event, env) {
    await observeCatalogSchedule(env, scheduledFetch);
  },
};

export default worker;

export * from './.open-next/worker.js';
