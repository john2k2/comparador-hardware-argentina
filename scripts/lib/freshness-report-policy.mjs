import { readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Sólo el recibo del productor atribuye observaciones propias; nunca las filas de una ventana.
export async function readRunnerEvidence(path) {
  const unavailable = reason => ({ status: 'unavailable', reason, artifact: basename(path) });
  let result;
  try { result = JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { return unavailable(error.code === 'ENOENT' ? 'runner-receipt-missing' : 'runner-receipt-invalid'); }
  if (result?.source !== 'priority-known-offers'
    || ['attempted', 'observed', 'comparable'].some(key => !Number.isSafeInteger(result[key]) || result[key] < 0)
    || result.observed > result.attempted || result.comparable > result.observed
    || !Array.isArray(result.missingGuideSlots) || result.missingGuideSlots.some(slot => typeof slot !== 'string')) {
    return unavailable('runner-receipt-invalid');
  }
  return { status: 'available', artifact: basename(path), source: result.source,
    attempted: result.attempted, observed: result.observed, comparable: result.comparable,
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
