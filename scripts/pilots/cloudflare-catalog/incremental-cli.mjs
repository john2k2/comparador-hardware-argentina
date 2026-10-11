// Planificar por defecto. --apply sólo modifica la copia SQLite local indicada.
import { writeFileSync, existsSync } from 'node:fs';
import { applyIncremental, loadIncrementalSnapshot, planIncremental } from './incremental-sync.mjs';
import { rebuildProjection } from './projection.mjs';
const args = process.argv.slice(2), apply = args.includes('--apply');
for (let i = 0; i < args.length; i++) {
  if (!args[i].startsWith('--')) continue;
  if (!['--apply', '--expected-generation', '--now', '--max-estimated-writes'].includes(args[i])) throw new Error('Opción no admitida: ' + args[i]);
  if (args[i] !== '--apply' && (!args[i + 1] || args[i + 1].startsWith('--'))) throw new Error('Falta valor: ' + args[i]);
}
const option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const positional = args.filter((arg, i) => !arg.startsWith('--') && (i === 0 || !['--expected-generation', '--now', '--max-estimated-writes'].includes(args[i - 1])));
const [before, after, sqlite, report] = positional;
if (!report || existsSync(report)) throw new Error('Usage: node incremental-cli.mjs BEFORE AFTER SQLITE NEW_REPORT [--apply --expected-generation HASH] [--now ISO] [--max-estimated-writes 80000]');
// No leer credenciales, ni URL, ni variables del proyecto.
let result;
if (apply) {
  if (!option('--expected-generation')) throw new Error('Se requiere la generación base explícita');
  result = await applyIncremental({ before, after, sqlite, expectedGeneration: option('--expected-generation'), projection: rebuildProjection,
    now: option('--now') ? Date.parse(option('--now')) : undefined, maxEstimatedRowsWritten: option('--max-estimated-writes') ? Number(option('--max-estimated-writes')) : 80000 });
} else {
  const a = await loadIncrementalSnapshot(before), b = await loadIncrementalSnapshot(after);
  result = { ...planIncremental(a, b), status: 'planned', writesExecuted: 0, d1RowsWritten: null, remoteVerified: false };
}
writeFileSync(report, JSON.stringify(result, null, 2), { mode: 0o600, flag: 'wx' });
console.log(JSON.stringify({ status: result.status, report, baseGeneration: result.baseGeneration, targetGeneration: result.targetGeneration,
  operations: result.operations.length, baseRowsWritten: result.baseRowsWritten ?? 0, estimatedRowsWritten: result.estimatedRowsWritten ?? null, dailyBudget: result.dailyBudget ?? null, remoteVerified: false }));
