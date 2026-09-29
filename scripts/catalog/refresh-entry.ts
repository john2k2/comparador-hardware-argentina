import { writeFile } from 'node:fs/promises';
import { runPriorityRefresh } from '../../src/lib/catalog/priority-refresh';
import { runRequestedRefresh } from '../../src/lib/catalog/on-demand/worker';
import { sourceHttpMetrics } from '../../src/lib/scrapers/source-http';

const [mode, output] = process.argv.slice(2);
if (!output || !['priority', 'guides', 'requested'].includes(mode)) throw new Error('INVALID_REFRESH_ARGUMENTS');
if (process.env.CATALOG_REQUESTED_RUNNER !== '1') throw new Error('REFRESH_RUNNER_REQUIRED');
try {
  const result = mode === 'requested' ? await runRequestedRefresh() : await runPriorityRefresh(mode === 'priority');
  await writeFile(output, JSON.stringify({ ...result, sourceHttp: sourceHttpMetrics() }, null, 2));
} catch (error) {
  // El log del runner conserva códigos propios, nunca mensajes de SDK o secretos.
  const code = error instanceof Error && /^(?:PRIORITY|REFRESH)_[A-Z_]+$/.test(error.message) ? error.message : 'REFRESH_FAILED';
  await writeFile(output, JSON.stringify({ error: code, sourceHttp: sourceHttpMetrics() }, null, 2));
  process.exitCode = 1;
}
