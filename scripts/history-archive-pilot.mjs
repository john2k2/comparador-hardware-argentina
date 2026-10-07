// Piloto manual: exporta como máximo 1.000 filas y nunca modifica la tabla de origen.
import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { buildHistoryArchive, verifyHistoryArchive } from './lib/history-archive.mjs';
import { HISTORY_COLUMNS, canonicalUtcTimestamp, exportHistorySample } from './lib/history-archive-export.mjs';
import { uploadHistoryArchive } from './lib/history-archive-storage.mjs';

const PROJECT_ID = 'zyiyziubpcpgoqlkcrie';
const [command, ...args] = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i++) {
  const key = args[i];
  if (!['--out', '--server-config', '--date', '--create-bucket'].includes(key) || key in options) throw new Error('HISTORY_CLI_ARGUMENT');
  if (key === '--create-bucket') options[key] = true;
  else {
    if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('HISTORY_CLI_VALUE');
    options[key] = args[++i];
  }
}
if (!['export', 'verify', 'upload'].includes(command) || !options['--out']) throw new Error('Use export|verify|upload --out <directory>');
if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('HISTORY_NODE_22_REQUIRED');
const dir = path.resolve(options['--out']);
const safePath = name => {
  const resolved = path.resolve(dir, name);
  if (!resolved.startsWith(dir + path.sep)) throw new Error('HISTORY_LOCAL_PATH');
  return resolved;
};
const readFile = async name => {
  const file = await fs.realpath(safePath(name));
  if (!file.startsWith(await fs.realpath(dir) + path.sep)) throw new Error('HISTORY_LOCAL_SYMLINK');
  if ((await fs.stat(file)).size > 1024 * 1024) throw new Error('HISTORY_LOCAL_FILE_BUDGET');
  return fs.readFile(file);
};
const expected = {
  projectId: PROJECT_ID,
  cutoff: '2026-07-09T00:00:00.000000Z',
  snapshotAt: '2026-10-07T19:16:07.876892Z',
};
const selectionDay = options['--date'];
let dayStart, dayEnd;
if (selectionDay) {
  dayStart = canonicalUtcTimestamp(`${selectionDay}T00:00:00Z`);
  dayEnd = canonicalUtcTimestamp(new Date(Date.parse(dayStart) + 86400000).toISOString());
  if (dayEnd > expected.cutoff) throw new Error('HISTORY_PILOT_DAY_AFTER_CUTOFF');
}
async function getClient() {
  if (!options['--server-config']) throw new Error('HISTORY_SERVER_ENV_REQUIRED');
  const env = parse(await fs.readFile(options['--server-config']));
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  if (!url || new URL(url).href !== `https://${PROJECT_ID}.supabase.co/`) throw new Error('HISTORY_PROJECT_MISMATCH');
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('HISTORY_SERVER_KEY_MISSING');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: {
    fetch: (target, init) => fetch(target, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) }),
  } });
}

try {
  if (command === 'export') {
    const client = await getClient();
    const sample = await exportHistorySample(async ({ cutoff, afterId, limit }) => {
      let query = client.from('price_history').select(HISTORY_COLUMNS.join(',')).lt('recorded_at', cutoff).order('id').limit(limit);
      if (afterId) query = query.gt('id', afterId);
      if (selectionDay) query = query.gte('recorded_at', dayStart).lt('recorded_at', dayEnd);
      const result = await query.csv();
      if (result.error || typeof result.data !== 'string') throw new Error('HISTORY_SOURCE_READ_FAILED');
      return result.data;
    }, { cutoff: expected.cutoff });
    if (selectionDay && sample.rows.some(row => !row.recorded_at.startsWith(selectionDay + 'T'))) throw new Error('HISTORY_SELECTION_DAY_MISMATCH');
    const archive = buildHistoryArchive(sample.rows, expected);
    await verifyHistoryArchive(archive.manifest, async name => archive.chunks.get(name), expected);
    // Directorio nuevo: una interrupción conserva lo escrito y no reemplaza otra entrega.
    await fs.mkdir(dir, { recursive: false, mode: 0o700 });
    for (const [name, bytes] of archive.chunks) {
      const file = safePath(name);
      await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
      await fs.writeFile(file, bytes, { flag: 'wx', mode: 0o600 });
    }
    await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(archive.manifest) + '\n', { flag: 'wx', mode: 0o600 });
    await fs.writeFile(path.join(dir, 'export-receipt.json'), JSON.stringify({ ...sample.receipt, selectionDay: selectionDay || null, completedAt: new Date().toISOString(), readOnly: true, originalRowsRemoved: 0 }) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ action: 'export', rows: sample.rows.length, chunks: archive.chunks.size, pages: sample.receipt.pages, globallyComplete: false, originalRowsRemoved: 0 }));
  } else {
    const manifest = JSON.parse((await readFile('manifest.json')).toString('utf8'));
    const rows = await verifyHistoryArchive(manifest, readFile, expected);
    if (selectionDay && rows.some(row => !row.recorded_at.startsWith(selectionDay + 'T'))) throw new Error('HISTORY_SELECTION_DAY_MISMATCH');
    if (command === 'verify') console.log(JSON.stringify({ action: 'verify', rows: rows.length, verified: true, originalRowsRemoved: 0 }));
    else {
      const chunks = new Map();
      for (const chunk of manifest.chunks) chunks.set(chunk.name, await readFile(chunk.name));
      const client = await getClient();
      const receipt = await uploadHistoryArchive(client.storage, { manifest, chunks }, expected, { createBucket: options['--create-bucket'] === true });
      await fs.writeFile(path.join(dir, 'storage-receipt.json'), JSON.stringify({ completedAt: new Date().toISOString(), ...receipt }) + '\n', { mode: 0o600 });
      console.log(JSON.stringify(receipt));
    }
  }
} catch (error) {
  console.error(JSON.stringify({ action: command, success: false, reason: /^[A-Z_0-9-]+$/.test(error.message) ? error.message : 'HISTORY_PILOT_FAILED', originalRowsRemoved: 0 }));
  process.exitCode = 1;
}
