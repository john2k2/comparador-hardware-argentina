// Laboratorio PG17 propio: CSV independiente contra recuperación de seis campos, sin TCP.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { verifyTelemetryBackup } from '../lib/telemetry-backup.mjs';
import { decodeTelemetrySelection } from '../lib/telemetry-selection-codec.mjs';
import { prepareBackedTelemetryRetention } from '../lib/telemetry-backed-retention.mjs';
import { checkDirectory, readPrivate, writeDurable, projectId, privateRoot } from '../lib/telemetry-backlog-io.mjs';

const pg = '/opt/homebrew/opt/postgresql@17/bin/';
const childEnv = { PATH: '/opt/homebrew/bin:/usr/bin:/bin', LC_ALL: 'C' };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => { throw new Error(`TELEMETRY_RESTORE_LOCAL_${code}`); };
const requireValue = (condition, code) => { if (!condition) fail(code); };
const budget = 4 * 1024 ** 2;

async function readSample(dir, sample) {
  requireValue(sample && /^[a-f0-9]{64}$/.test(sample.manifestSha256)
    && /^[a-f0-9]{64}$/.test(sample.sourceCsvSha256)
    && Number.isSafeInteger(sample.rows) && sample.rows >= 1 && sample.rows <= 250, 'SAMPLE');
  const folder = await checkDirectory(path.join(dir, sample.manifestSha256));
  const manifestBytes = await readPrivate(path.join(folder, 'manifest.json'));
  requireValue(sha(manifestBytes) === sample.manifestSha256, 'MANIFEST_HASH');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const gzipBytes = await readPrivate(path.join(folder, 'telemetry.json.gz'));
  const compressedSelection = await readPrivate(path.join(folder, 'selection.json.gz'));
  const selectionBytes = decodeTelemetrySelection(compressedSelection);
  requireValue(sha(selectionBytes) === manifest.selectionSha256, 'SELECTION_HASH');
  const selection = JSON.parse(selectionBytes.toString('utf8'));
  requireValue(selection && Object.keys(selection).length === 3 && Object.hasOwn(selection, 'rows')
    && selection.projectId === projectId && selection.cutoff === manifest.cutoff, 'SELECTION');
  const expected = { projectId, cutoff: selection.cutoff, selectionSha256: manifest.selectionSha256, selection: selection.rows };
  const rows = verifyTelemetryBackup(manifest, gzipBytes, expected);
  requireValue(rows.length === sample.rows && rows.every(row => row.scope === sample.scope), 'ROW_COUNT_SCOPE');
  requireValue(gzipBytes.length + manifestBytes.length + compressedSelection.length === sample.storedBytes, 'STORED_BYTES');
  const snapshot = JSON.parse((await readPrivate(path.join(folder, 'snapshot.json'), budget)).toString('utf8'));
  assert.deepEqual(snapshot, rows.map(({ payload, ...row }) => ({ cache_key: row.cache_key, scope: row.scope,
    payload_text: payload, expires_at: row.expires_at, created_at: row.created_at, updated_at: row.updated_at })));
  const csv = await readPrivate(path.join(folder, 'source.csv'), budget);
  requireValue(csv.length === sample.sourceCsvBytes && sha(csv) === sample.sourceCsvSha256, 'SOURCE_CSV_HASH');
  return { manifest, gzipBytes, expected, rows, csv };
}

export async function runTelemetryBacklogRestore(dirArgument, receiptName) {
  const dir = await checkDirectory(path.resolve(dirArgument));
  requireValue(path.dirname(dir) === privateRoot, 'PREPARATION_SCOPE');
  requireValue(typeof receiptName === 'string' && /^restore-local-[a-z0-9-]+\.json$/.test(receiptName), 'RECEIPT_NAME');
  try { await fs.lstat(path.join(dir, receiptName)); fail('RECEIPT_EXISTS'); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  const sampleBytes = await readPrivate(path.join(dir, 'sample.json'));
  const samplePlan = JSON.parse(sampleBytes.toString('utf8'));
  requireValue(samplePlan.readOnly === true && samplePlan.originalRowsRemoved === 0
    && Array.isArray(samplePlan.samples) && samplePlan.samples.length === 8, 'EIGHT_SAMPLES');
  requireValue(new Set(samplePlan.samples.map(sample => sample.manifestSha256)).size === 8, 'DISTINCT_SAMPLES');
  const prepared = [];
  for (const sample of samplePlan.samples) prepared.push(await readSample(dir, sample));
  requireValue(prepared.reduce((total, sample) => total + sample.rows.length, 0) <= 2000, 'ROWS_BUDGET');

  // /var/folders de macOS puede exceder el límite del nombre de socket UNIX.
  const local = await fs.mkdtemp(path.join(await fs.realpath('/tmp'), 'ch-br-'));
  await fs.chmod(local, 0o700);
  const data = path.join(local, 'data'), socket = path.join(local, 'socket');
  await fs.mkdir(socket, { mode: 0o700 });
  let phase = 'INITDB';
  const run = (binary, args, input) => {
    try { return execFileSync(pg + binary, args, { env: childEnv, input, encoding: 'utf8', timeout: 30000,
      maxBuffer: 2 * budget, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch { fail(`PG_${phase}_OPERATION`); }
  };
  const connection = ['-h', socket, '-p', '55491', '-U', 'postgres', '-d', 'backlog_restore_local', '-X', '-Atq', '-v', 'ON_ERROR_STOP=1'];
  const query = sql => run('psql', connection, sql).trim();
  const result = sql => JSON.parse(query(sql));
  const sourceDifference = () => Number(query(`SELECT count(*) FROM (
    (SELECT * FROM reference_rows EXCEPT ALL SELECT * FROM public.api_cache_entries WHERE cache_key IN(SELECT cache_key FROM reference_rows))
    UNION ALL (SELECT * FROM public.api_cache_entries WHERE cache_key IN(SELECT cache_key FROM reference_rows) EXCEPT ALL SELECT * FROM reference_rows)) d;`));
  const sentinels = () => query(`SELECT md5(string_agg(t::text,'' ORDER BY cache_key)) FROM public.api_cache_entries t
    WHERE cache_key IN('__restore_lab_active','__restore_lab_other','__restore_lab_recent');
    SELECT md5(string_agg(t::text,'' ORDER BY name)) FROM sentinels t;`);
  const receipts = [], startedAt = new Date().toISOString();
  let started = false, startupAttempted = false, receipt;
  try {
    run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-locale', '--encoding=UTF8']);
    const log = path.join(local, 'server.log');
    await fs.writeFile(log, '', { flag: 'wx', mode: 0o600 });
    startupAttempted = true;
    phase = 'START';
    run('pg_ctl', ['-D', data, '-l', log, '-o', `-h '' -p 55491 -k ${socket} -c cluster_name=backlog-restore-local`, '-w', 'start']);
    started = true;
    phase = 'CREATEDB';
    run('createdb', ['-h', socket, '-p', '55491', '-U', 'postgres', 'backlog_restore_local']);
    phase = 'IDENTITY';
    requireValue(query('SHOW data_directory;') === data, 'CLUSTER_DIRECTORY');
    requireValue(query('SHOW cluster_name;') === 'backlog-restore-local', 'CLUSTER_IDENTITY');
    requireValue(query('SHOW listen_addresses;') === '', 'NO_TCP');
    const postgresVersion = query('SHOW server_version;');
    requireValue(/^17\./.test(postgresVersion), 'PG_VERSION');
    phase = 'SCHEMA';
    query(`CREATE TABLE public.api_cache_entries(cache_key text PRIMARY KEY,scope text NOT NULL,payload jsonb NOT NULL,
      expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL);
      CREATE TABLE reference_rows(LIKE public.api_cache_entries);
      CREATE TABLE changed_row(LIKE public.api_cache_entries);
      CREATE TABLE sentinels(name text PRIMARY KEY,value text NOT NULL);
      INSERT INTO sentinels VALUES('users','preserved'),('prices','preserved'),('history','preserved');`);
    for (let index = 0; index < prepared.length; index++) {
      const { manifest, gzipBytes, expected, rows, csv } = prepared[index];
      const sample = samplePlan.samples[index], begin = performance.now();
      requireValue(rows.every(row => !row.cache_key.startsWith('__restore_lab_')), 'SENTINEL_KEY_COLLISION');
      const sql = prepareBackedTelemetryRetention({ manifest, gzipBytes }, expected);
      phase = 'SAMPLE_SETUP';
      query(`TRUNCATE public.api_cache_entries,reference_rows,changed_row;
        INSERT INTO public.api_cache_entries VALUES
        ('__restore_lab_active','operational-store-event','{}','2030-01-01','2026-10-08','2026-10-08'),
        ('__restore_lab_other','products','{}','2020-01-01','2020-01-01','2020-01-01'),
        ('__restore_lab_recent','operational-endpoint-event','{}','2030-01-01','2026-10-08','2026-10-08');`);
      phase = 'COPY';
      run('psql', [...connection, '-c', 'COPY reference_rows FROM STDIN WITH(FORMAT csv,HEADER true)'], csv);
      requireValue(Number(query('SELECT count(*) FROM reference_rows;')) === rows.length, 'CSV_ROW_COUNT');
      // Primera restauración usa el respaldo; la referencia fue importada por COPY independiente.
      phase = 'INITIAL_RESTORE';
      const initial = result(sql.restore);
      requireValue(initial.restored === rows.length && sourceDifference() === 0, 'SOURCE_BACKUP_EQUAL');
      const preserved = sentinels();
      phase = 'PREVIEW';
      const preview = result(sql.preview);
      requireValue(preview.matched === rows.length && preview.original_rows_removed === 0, 'PREVIEW');
      phase = 'RETIRE';
      const retired = result(sql.apply);
      requireValue(retired.removed === rows.length && retired.changed_or_missing === 0, 'RETIRE');
      requireValue(Number(query('SELECT count(*) FROM public.api_cache_entries;')) === 3 && sentinels() === preserved, 'RETIRE_SENTINELS');
      const retiredAgain = result(sql.apply);
      requireValue(retiredAgain.removed === 0 && retiredAgain.changed_or_missing === rows.length, 'RETIRE_IDEMPOTENT');
      phase = 'RESTORE';
      const restored = result(sql.restore);
      requireValue(restored.restored === rows.length && sourceDifference() === 0, 'EXACT_RESTORE');
      const restoredAgain = result(sql.restore);
      requireValue(restoredAgain.restored === 0 && restoredAgain.existing_preserved === rows.length
        && sourceDifference() === 0, 'RESTORE_IDEMPOTENT');
      phase = 'CHANGED_ROW';
      query(`UPDATE public.api_cache_entries SET payload='{"restore_lab_change":true}'::jsonb,updated_at=updated_at+interval '1 microsecond'
        WHERE cache_key=(SELECT cache_key FROM reference_rows ORDER BY cache_key LIMIT 1);
        INSERT INTO changed_row SELECT * FROM public.api_cache_entries WHERE cache_key IN(SELECT cache_key FROM reference_rows ORDER BY cache_key LIMIT 1);`);
      const changedDelete = result(sql.apply);
      requireValue(changedDelete.removed === rows.length - 1 && changedDelete.changed_or_missing === 1, 'CAS_PRESERVES_CHANGE');
      const changedRestore = result(sql.restore);
      requireValue(changedRestore.restored === rows.length - 1 && changedRestore.existing_preserved === 1, 'RESTORE_PRESERVES_CHANGE');
      requireValue(Number(query(`WITH expected AS (SELECT * FROM reference_rows WHERE cache_key NOT IN(SELECT cache_key FROM changed_row)
        UNION ALL SELECT * FROM changed_row), actual AS (SELECT * FROM public.api_cache_entries WHERE cache_key IN(SELECT cache_key FROM reference_rows))
        SELECT count(*) FROM ((SELECT * FROM expected EXCEPT ALL SELECT * FROM actual)
        UNION ALL (SELECT * FROM actual EXCEPT ALL SELECT * FROM expected)) differences;`)) === 0, 'CHANGED_EXACT');
      requireValue(sentinels() === preserved, 'ALL_SENTINELS');
      receipts.push({ manifestSha256: sample.manifestSha256, sourceCsvSha256: sample.sourceCsvSha256, scope: sample.scope,
        offset: sample.offset, rows: rows.length, fieldsCompared: 6, sourceBackupDifferenceRows: 0,
        retired: retired.removed, restored: restored.restored, repeatRetired: 0, repeatRestored: 0,
        changedRowPreserved: true, sentinelsPreserved: true, wallMs: Math.round((performance.now() - begin) * 100) / 100 });
    }
    receipt = { version: 1, startedAt, completedAt: new Date().toISOString(), localOnly: true, noTcp: true,
      productionChanges: false, projectEnvironmentRead: false, postgresVersion, samplePlanSha256: sha(sampleBytes),
      sampleCount: receipts.length, totalRows: receipts.reduce((total, sample) => total + sample.rows, 0),
      fieldsCompared: 6, samples: receipts, exactRestore: true, changedRowsPreserved: true,
      clusterDirectory: local, clusterStopped: false,
      limits: ['Eight systematic samples verify those rows, not the complete backlog or whole database.',
        'Independent PostgreSQL COPY validates JSONB numeric precision and six source fields.',
        'Local delete and restore do not demonstrate remote execution, physical savings, or Storage custody.',
        'No production restoration is included or authorized by this laboratory.'] };
  } finally {
    if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
    else if (startupAttempted) {
      // Un timeout de start puede haber dejado vivo únicamente este clúster nuevo.
      let ownClusterRunning = false;
      try { execFileSync(pg + 'pg_ctl', ['-D', data, 'status'], { env: childEnv, timeout: 10000, stdio: 'pipe' }); ownClusterRunning = true; } catch { /* No proceso propio confirmado. */ }
      if (ownClusterRunning) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
    }
  }
  receipt.clusterStopped = true;
  await writeDurable(dir, receiptName, JSON.stringify(receipt, null, 2) + '\n');
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    requireValue(process.argv.length === 4, 'ARGUMENTS');
    const receipt = await runTelemetryBacklogRestore(process.argv[2], process.argv[3]);
    console.log(JSON.stringify({ success: true, localOnly: true, noTcp: true, sampleCount: receipt.sampleCount,
      totalRows: receipt.totalRows, exactRestore: true, changedRowsPreserved: true, clusterStopped: receipt.clusterStopped }));
  } catch (error) {
    console.error(JSON.stringify({ success: false, localOnly: true, productionChanges: false,
      reason: error instanceof Error && /^TELEMETRY_(?:RESTORE_LOCAL|BACKUP|DRAIN|SELECTION)_[A-Z_]+$/.test(error.message)
        ? error.message : 'TELEMETRY_RESTORE_LOCAL_FAILED' }));
    process.exitCode = 1;
  }
}
