import { readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Sólo el recibo del productor atribuye observaciones propias; nunca las filas de una ventana.
export async function readRunnerEvidence(path) {
  const unavailable = reason => ({ status: 'unavailable', reason, artifact: basename(path) });
  let result;
  try { result = JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { return unavailable(error.code === 'ENOENT' ? 'runner-receipt-missing' : 'runner-receipt-invalid'); }
  if (result?.source === 'priority-known-offers' && result.status === 'deferred'
    && result.reason === 'PRIORITY_REFRESH_DEFERRED'
    && !['attempted', 'observed', 'comparable', 'missingGuideSlots'].some(key => key in result)) {
    return { status: 'deferred', reason: result.reason, artifact: basename(path) };
  }
  const counts = result?.critical ?? result;
  if (result?.source !== 'priority-known-offers' || (result.demand && !result.critical)
    || ['attempted', 'observed', 'comparable'].some(key => !Number.isSafeInteger(counts?.[key]) || counts[key] < 0)
    || counts.observed > counts.attempted || counts.comparable > counts.observed
    || !Array.isArray(result.missingGuideSlots) || result.missingGuideSlots.some(slot => typeof slot !== 'string')) {
    return unavailable('runner-receipt-invalid');
  }
  return { status: 'available', artifact: basename(path), source: result.source,
    attempted: counts.attempted, observed: counts.observed, comparable: counts.comparable,
    missingGuideSlots: result.missingGuideSlots };
}

export async function writeGuideReportingReceipt(runnerPath, outputPath) {
  if (!runnerPath || !outputPath || resolve(runnerPath) === resolve(outputPath)) throw new Error('FRESHNESS_REPORT_PATHS_INVALID');
  const report = { measuredAt: new Date().toISOString(), status: 'omitted', mode: 'guides', reason: 'guides-use-runner-receipt',
    definition: 'Se omite el diagnóstico global en guías; los conteos propios proceden del artefacto del runner, no de una consulta de ventana.',
    runnerEvidence: await readRunnerEvidence(runnerPath) };
  await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n');
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [runnerPath, outputPath] = process.argv.slice(2);
  console.log(JSON.stringify(await writeGuideReportingReceipt(runnerPath, outputPath)));
}
