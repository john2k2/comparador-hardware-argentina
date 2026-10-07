// Piloto manual ligado al recibo aprobado de lectura. Nunca modifica la tabla de origen.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parse } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { parseTelemetryCsv, buildTelemetryBackup, verifyTelemetryBackup } from './lib/telemetry-backup.mjs';
import { createTelemetryPreflightFetch } from './lib/telemetry-preflight-fetch.mjs';
import { TELEMETRY_FILE, createTelemetryStorageFetch, telemetryManifestPlan, uploadTelemetryBackup, downloadTelemetryBackup } from './lib/telemetry-backup-storage.mjs';

const PROJECT_ID = 'zyiyziubpcpgoqlkcrie';
const ORIGIN = `https://${PROJECT_ID}.supabase.co`;
const CUTOFF = '2026-10-07T20:10:00.000000Z';
const SELECTION_SHA256 = '28200f5820003ab6634f2acd09ac0322a61395bfb5d3175d230b271b99aee009';
const COLUMNS = ['cache_key', 'scope', 'payload', 'expires_at', 'created_at', 'updated_at'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = reason => { throw new Error(reason); };

try {
  if (Number(process.versions.node.split('.')[0]) < 22) fail('TELEMETRY_NODE_22_REQUIRED');
  const [command, ...args] = process.argv.slice(2);
  if (!['export', 'upload', 'download', 'check-source'].includes(command)) fail('TELEMETRY_COMMAND');
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!['--server-config', '--selection', '--archive', '--out'].includes(key) || key in options) fail('TELEMETRY_ARGUMENT');
    if (!args[i + 1] || args[i + 1].startsWith('--')) fail('TELEMETRY_ARGUMENT_VALUE');
    options[key] = args[++i];
  }
  if (!options['--server-config'] || !options['--selection'] || !options['--archive']) fail('TELEMETRY_CONFIG_REQUIRED');
  if (['download', 'check-source'].includes(command) !== Boolean(options['--out'])) fail('TELEMETRY_OUTPUT_CONTRACT');
  const selectionFile = await fs.readFile(options['--selection']);
  if (selectionFile.length > 128 * 1024 || sha256(selectionFile) !== SELECTION_SHA256) fail('TELEMETRY_SELECTION_HASH');
  const selection = JSON.parse(selectionFile.toString('utf8'));
  if (selection.projectId !== PROJECT_ID || selection.cutoff !== CUTOFF || selection.selected !== 250
    || selection.removed !== 0 || selection.unknown !== 0 || selection.success !== true || selection.rows?.length !== 250) {
    fail('TELEMETRY_SELECTION_CONTRACT');
  }
  const expected = { projectId: PROJECT_ID, cutoff: CUTOFF, selectionSha256: SELECTION_SHA256, selection: selection.rows };
  const dir = path.resolve(options['--archive']);
  async function readLocal(name) {
    const root = await fs.realpath(dir);
    const file = await fs.realpath(path.join(root, name));
    if (!file.startsWith(root + path.sep) || (await fs.stat(file)).size > 1024 * 1024) fail('TELEMETRY_LOCAL_FILE');
    return fs.readFile(file);
  }
  const writeNew = async (file, bytes) => fs.writeFile(file, bytes, { flag: 'wx', mode: 0o600 });
  async function client(fetchGuard) {
    const env = parse(await fs.readFile(options['--server-config']));
    const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
    if (!url || new URL(url).href !== `${ORIGIN}/`) fail('TELEMETRY_PROJECT_MISMATCH');
    const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) fail('TELEMETRY_SERVER_KEY_MISSING');
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fetchGuard } });
  }
  async function readSource() {
    const source = await client(createTelemetryPreflightFetch(ORIGIN));
    const pages = [];
    for (let offset = 0; offset < selection.rows.length; offset += 50) {
      const keys = selection.rows.slice(offset, offset + 50).map(row => row.cache_key);
      const response = await source.from('api_cache_entries').select(COLUMNS.join(',')).in('cache_key', keys).order('cache_key').limit(keys.length).csv();
      if (response.error || typeof response.data !== 'string') fail('TELEMETRY_SOURCE_READ');
      // Sólo se retira el header fijo de páginas siguientes; los campos pueden contener saltos.
      const csv = response.data;
      const headerEnd = csv.indexOf('\n');
      if (headerEnd < 0 || csv.slice(0, headerEnd).replace(/\r$/, '') !== COLUMNS.join(',')) fail('TELEMETRY_SOURCE_HEADER');
      pages.push((offset === 0 ? csv : csv.slice(headerEnd + 1)).replace(/\n?$/, '\n'));
      if (pages.reduce((sum, page) => sum + Buffer.byteLength(page), 0) > 4 * 1024 * 1024) fail('TELEMETRY_SOURCE_BUDGET');
    }
    const csv = pages.join('');
    const rows = parseTelemetryCsv(csv);
    const backup = buildTelemetryBackup(rows, expected);
    verifyTelemetryBackup(backup.manifest, backup.gzipBytes, expected);
    return { csv, backup, pages: pages.length };
  }

  if (command === 'export') {
    const { csv, backup, pages } = await readSource();
    await fs.mkdir(dir, { mode: 0o700 });
    await writeNew(path.join(dir, 'source.csv'), csv);
    await writeNew(path.join(dir, TELEMETRY_FILE), backup.gzipBytes);
    await writeNew(path.join(dir, 'manifest.json'), JSON.stringify(backup.manifest) + '\n');
    await writeNew(path.join(dir, 'export-receipt.json'), JSON.stringify({ completedAt: new Date().toISOString(), pages,
      sourceCsvBytes: Buffer.byteLength(csv), sourceCsvSha256: sha256(csv), selected: 250, originalRowsRemoved: 0, transactionalSnapshot: false }) + '\n');
    console.log(JSON.stringify({ action: command, rows: 250, pages, sourceReadOnly: true, originalRowsRemoved: 0 }));
  } else {
    const manifest = JSON.parse((await readLocal('manifest.json')).toString('utf8'));
    if (manifest.projectId !== PROJECT_ID || manifest.cutoff !== CUTOFF || manifest.selectionSha256 !== SELECTION_SHA256 || manifest.rowCount !== 250) {
      fail('TELEMETRY_MANIFEST_ANCHOR');
    }
    const backup = command === 'download' ? null : { manifest, gzipBytes: await readLocal(TELEMETRY_FILE) };
    if (backup) verifyTelemetryBackup(backup.manifest, backup.gzipBytes, expected);
    let receipt;
    if (command === 'check-source') {
      const current = await readSource();
      if (current.backup.manifest.rawSha256 !== backup.manifest.rawSha256) fail('TELEMETRY_SOURCE_CHANGED');
      receipt = { action: command, completedAt: new Date().toISOString(), rows: 250, sixFieldsUnchanged: true, pages: current.pages, originalRowsRemoved: 0 };
      await writeNew(path.resolve(options['--out']), JSON.stringify(receipt) + '\n');
    } else {
      const plan = telemetryManifestPlan(manifest);
      const target = await client(createTelemetryStorageFetch(ORIGIN, plan.keys, { allowUpload: command === 'upload' }));
      if (command === 'upload') {
        receipt = { action: command, completedAt: new Date().toISOString(), ...await uploadTelemetryBackup(target.storage, backup, expected) };
        await writeNew(path.join(dir, 'storage-receipt.json'), JSON.stringify(receipt) + '\n');
      } else {
        const restored = await downloadTelemetryBackup(target.storage, manifest, expected);
        const out = path.resolve(options['--out']);
        await fs.mkdir(out, { mode: 0o700 });
        await writeNew(path.join(out, TELEMETRY_FILE), restored.gzipBytes);
        await writeNew(path.join(out, 'manifest.json'), JSON.stringify(restored.manifest) + '\n');
        receipt = { action: command, completedAt: new Date().toISOString(), rows: restored.rows.length,
          prefix: restored.prefix, manifestSha256: restored.manifestSha256, remoteBytesExact: true, originalRowsRemoved: 0 };
        await writeNew(path.join(out, 'download-receipt.json'), JSON.stringify(receipt) + '\n');
      }
    }
    console.log(JSON.stringify(receipt));
  }
} catch (error) {
  const reason = error instanceof Error && /^[A-Z_0-9]+$/.test(error.message) ? error.message : 'TELEMETRY_BACKUP_FAILED';
  console.error(JSON.stringify({ success: false, reason, originalRowsRemoved: 0 }));
  process.exitCode = 1;
}
