import handler from './.open-next/worker.js';
import { observeCatalogSchedule } from './src/lib/catalog/scheduler.ts';

const worker = {
  ...handler,
  async scheduled(_event, env) {
    await observeCatalogSchedule(env);
  },
};

export default worker;

export { DOQueueHandler, DOShardedTagCache } from './.open-next/worker.js';
