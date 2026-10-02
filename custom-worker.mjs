import handler from './.open-next/worker.js';
import { observeCatalogSchedule } from './src/lib/catalog/scheduler.ts';

// Conservar el transporte nativo: Next adapta el global durante peticiones HTTP.
const scheduledFetch = globalThis.fetch.bind(globalThis);

const worker = {
  ...handler,
  async scheduled(_event, env) {
    await observeCatalogSchedule(env, scheduledFetch);
  },
};

export default worker;

export { DOQueueHandler, DOShardedTagCache } from './.open-next/worker.js';
