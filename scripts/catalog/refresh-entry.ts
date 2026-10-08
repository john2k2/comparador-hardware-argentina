import { writeFile } from 'node:fs/promises';
import { runAdaptiveRefresh } from '../../src/lib/catalog/adaptive-refresh';
import { runPriorityRefresh } from '../../src/lib/catalog/priority-refresh';
import { runRequestedRefresh } from '../../src/lib/catalog/on-demand/worker';
import { sourceHttpMetrics } from '../../src/lib/scrapers/source-http';
import { extractRefreshClaimDiagnostic } from '../../src/lib/catalog/refresh-diagnostics';

const [mode, output] = process.argv.slice(2);
if (!output || !['priority', 'guides', 'requested', 'adaptive'].includes(mode)) throw new Error('INVALID_REFRESH_ARGUMENTS');
if (process.env.CATALOG_REQUESTED_RUNNER !== '1') throw new Error('REFRESH_RUNNER_REQUIRED');
const trigger = ['github-schedule', 'cloudflare-fallback'].includes(process.env.CATALOG_RUN_TRIGGER ?? '')
  ? process.env.CATALOG_RUN_TRIGGER : 'manual';
try {
  const result = mode === 'adaptive' ? await runAdaptiveRefresh() : mode === 'requested' ? await runRequestedRefresh() : await runPriorityRefresh(mode === 'priority');
  await writeFile(output, JSON.stringify({ ...result, trigger, sourceHttp: sourceHttpMetrics() }, null, 2));
  if ('status' in result && result.status === 'failed') process.exitCode = 1;
} catch (error) {
  // El log del runner conserva códigos propios, nunca mensajes de SDK o secretos.
  const code = error instanceof Error && /^(?:PRIORITY|REFRESH)_[A-Z_]+$/.test(error.message) ? error.message : 'REFRESH_FAILED';
  const claimDiagnostic = extractRefreshClaimDiagnostic(error);
  await writeFile(output, JSON.stringify({ error: code, trigger,
    ...(claimDiagnostic ? { claimDiagnostic } : {}), sourceHttp: sourceHttpMetrics() }, null, 2));
  process.exitCode = 1;
}
