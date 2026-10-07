// Contraste independiente de sólo lectura; conserva las respuestas CSV sin normalizar.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { verifyHistoryArchive } from '../lib/history-archive.mjs';
import { HISTORY_COLUMNS, parseHistoryCsv } from '../lib/history-archive-export.mjs';

const args = process.argv.slice(2);
assert.equal(args.length, 3, 'Use source-check <archive-directory> <private-server-config> <report-file>');
const dir = await fs.realpath(args[0]);
const expected = { projectId: 'zyiyziubpcpgoqlkcrie', cutoff: '2026-07-09T00:00:00.000000Z', snapshotAt: '2026-10-07T19:16:07.876892Z' };
const manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'));
const rows = await verifyHistoryArchive(manifest, async name => {
  const file = await fs.realpath(path.resolve(dir, name));
  assert.ok(file.startsWith(dir + path.sep));
  assert.ok((await fs.stat(file)).size <= 1024 * 1024);
  return fs.readFile(file);
}, expected);
const env = parse(await fs.readFile(args[1]));
assert.equal(new URL(env.NEXT_PUBLIC_SUPABASE_URL).href, `https://${expected.projectId}.supabase.co/`);
const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(key, 'Falta configuración privada');
const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false }, global: {
  fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15000) }),
} });
const originalCsvDir = path.join(dir, 'source-csv');
await fs.mkdir(originalCsvDir, { mode: 0o700 });
const originalRows = [];
let pages = 0;
for (let offset = 0; offset < rows.length; offset += 250) {
  const ids = rows.slice(offset, offset + 250).map(row => row.id);
  const result = await client.from('price_history').select(HISTORY_COLUMNS.join(',')).in('id', ids).order('id').limit(250).csv();
  if (result.error || typeof result.data !== 'string') throw new Error('HISTORY_SOURCE_CONTRAST_READ_FAILED');
  // No reconstruir esta respuesta desde el archivo: es una segunda lectura real del origen.
  await fs.writeFile(path.join(originalCsvDir, `page-${pages++}.csv`), result.data, { mode: 0o600, flag: 'wx' });
  const page = parseHistoryCsv(result.data);
  assert.equal(page.length, ids.length, 'Faltan originales de la muestra');
  originalRows.push(...page);
}
const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
assert.deepEqual([...originalRows].sort(byId), [...rows].sort(byId), 'Los ocho campos originales deben coincidir con el archivo');
const receipt = { observedAt: new Date().toISOString(), sourceRows: originalRows.length, archivedRows: rows.length, comparedFields: 8,
  exactFieldValuesMatch: true, sourceOriginalsPresent: true, rawCsvPagesSaved: pages, readOnly: true, transactionalSnapshot: false,
  originalRowsRemoved: 0, globalBackupProven: false };
const report = path.resolve(args[2]);
await fs.mkdir(path.dirname(report), { recursive: true });
await fs.writeFile(report, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify(receipt));
