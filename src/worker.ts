import openNextWorker from '../.open-next/worker.js';
import { createScanGuard } from './lib/server/scan-guard';

// Conserva los Durable Objects y futuros exports del Worker generado.
export * from '../.open-next/worker.js';

const worker = {
  ...openNextWorker,
  fetch: createScanGuard((request, env, context) => openNextWorker.fetch(request, env, context)),
};

export default worker;
