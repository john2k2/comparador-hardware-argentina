// Ensayo de recuperación en un cluster PG17 nuevo, ligado a loopback y creado por este proceso.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { verifyTelemetryBackup, buildTelemetryBackup } from '../lib/telemetry-backup.mjs';
import { prepareBackedTelemetryRetention } from '../lib/telemetry-backed-retention.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const literal = value => "'" + value.replaceAll("'", "''") + "'";
const SELECTION_SHA = '28200f5820003ab6634f2acd09ac0322a61395bfb5d3175d230b271b99aee009';

try {
  const args = process.argv.slice(2);
  assert.equal(args.length, 4, 'TELEMETRY_RESTORE_ARGUMENTS');
  const [sourceDir, downloadedDir] = await Promise.all(args.slice(0, 2).map(dir => fs.realpath(dir)));
  const selectionBytes = await fs.readFile(args[2]);
  assert.equal(hash(selectionBytes), SELECTION_SHA, 'TELEMETRY_SELECTION_HASH');
  const selection = JSON.parse(selectionBytes.toString('utf8'));
  const expected = { projectId: 'zyiyziubpcpgoqlkcrie', cutoff: '2026-10-07T20:10:00.000000Z', selectionSha256: SELECTION_SHA, selection: selection.rows };
  async function readPrivate(root, name, limit) {
    const file = await fs.realpath(path.join(root, name));
    assert.ok(file.startsWith(root + path.sep), 'TELEMETRY_RESTORE_LOCAL_PATH');
    assert.ok((await fs.stat(file)).size <= limit, 'TELEMETRY_RESTORE_LOCAL_BUDGET');
    return fs.readFile(file);
  }
  const manifestBytes = await readPrivate(downloadedDir, 'manifest.json', 1024 * 1024);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const gzipBytes = await readPrivate(downloadedDir, 'telemetry.json.gz', 1024 * 1024);
  const rows = verifyTelemetryBackup(manifest, gzipBytes, expected);
  const retirement = prepareBackedTelemetryRetention({ manifest, gzipBytes }, expected);
  assert.equal(rows.length, 250, 'TELEMETRY_RESTORE_SAMPLE');
  assert.equal(hash(manifestBytes), hash(await readPrivate(sourceDir, 'manifest.json', 1024 * 1024)), 'TELEMETRY_RESTORE_MANIFEST');
  const csv = await readPrivate(sourceDir, 'source.csv', 4 * 1024 * 1024);
  const exportReceipt = JSON.parse((await readPrivate(sourceDir, 'export-receipt.json', 128 * 1024)).toString('utf8'));
  assert.equal(hash(csv), exportReceipt.sourceCsvSha256, 'TELEMETRY_RESTORE_REFERENCE_HASH');

  const pg = '/opt/homebrew/opt/postgresql@17/bin/';
  const env = { PATH: '/opt/homebrew/bin:/usr/bin:/bin', LC_ALL: 'C' };
  const local = await fs.mkdtemp(path.join(os.tmpdir(), 'comparador-telemetry-restore-'));
  const data = path.join(local, 'data');
  const port = '55487';
  const connection = ['-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', 'telemetry_backup_local', '-X', '-Atq', '-v', 'ON_ERROR_STOP=1'];
  const run = (binary, argv, input) => {
    try { return execFileSync(pg + binary, argv, { env, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 }); }
    catch { throw new Error('TELEMETRY_LOCAL_PG_OPERATION'); }
  };
  const query = sql => run('psql', connection, sql).trim();
  const columns = 'cache_key,scope,payload,expires_at,created_at,updated_at';
  const insert = input => `INSERT INTO api_cache_entries(${columns}) SELECT cache_key,scope,payload::jsonb,expires_at::timestamptz,created_at::timestamptz,updated_at::timestamptz
    FROM jsonb_to_recordset(${literal(JSON.stringify(input))}::jsonb) AS x(cache_key text,scope text,payload text,expires_at text,created_at text,updated_at text) ON CONFLICT(cache_key) DO NOTHING;`;
  const selected = 'cache_key IN (SELECT cache_key FROM reference_rows)';
  const differences = () => Number(query(`SELECT count(*) FROM (
    (SELECT ${columns} FROM reference_rows EXCEPT ALL SELECT ${columns} FROM api_cache_entries WHERE ${selected}) UNION ALL
    (SELECT ${columns} FROM api_cache_entries WHERE ${selected} EXCEPT ALL SELECT ${columns} FROM reference_rows)) d;`));
  const sentinels = () => query(`SELECT jsonb_build_object('users',(SELECT jsonb_agg(t) FROM user_profiles t),
    'prices',(SELECT jsonb_agg(t) FROM product_prices t),'history',(SELECT jsonb_agg(t) FROM price_history t),
    'protected_cache',(SELECT jsonb_agg(t ORDER BY cache_key) FROM api_cache_entries t WHERE cache_key LIKE 'protected:%'));`);
  const cases = [], startedAt = performance.now();
  let started = false, receipt;
  try {
    const readiness = spawnSync(pg + 'pg_isready', ['-h', '127.0.0.1', '-p', port], { env, encoding: 'utf8' });
    assert.equal(readiness.status, 2, 'TELEMETRY_LOCAL_PORT_IN_USE');
    run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-locale', '--encoding=UTF8']);
    await fs.writeFile(path.join(local, 'server.log'), '', { flag: 'wx', mode: 0o600 });
    run('pg_ctl', ['-D', data, '-l', path.join(local, 'server.log'), '-o', `-h 127.0.0.1 -p ${port} -c unix_socket_directories='' -c cluster_name=telemetry-backup-local`, '-w', 'start']);
    started = true;
    run('createdb', ['-h', '127.0.0.1', '-p', port, '-U', 'postgres', 'telemetry_backup_local']);
    assert.equal(query('SHOW cluster_name;'), 'telemetry-backup-local');
    assert.equal(query('SHOW data_directory;'), data);
    const version = query('SHOW server_version;'); assert.match(version, /^17\./);
    query(`CREATE TABLE api_cache_entries(cache_key text PRIMARY KEY,scope text NOT NULL,payload jsonb NOT NULL,
      expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE reference_rows(LIKE api_cache_entries INCLUDING ALL);
      CREATE TABLE user_profiles(id text); INSERT INTO user_profiles VALUES('untouched');
      CREATE TABLE product_prices(price numeric); INSERT INTO product_prices VALUES(12345.67);
      CREATE TABLE price_history(price numeric); INSERT INTO price_history VALUES(10000.00);
      INSERT INTO api_cache_entries VALUES('protected:active','operational-store-event','{}','2030-01-01','2026-10-07','2026-10-07'),
        ('protected:demand','catalog-refresh-demand','{}','2026-01-01','2026-01-01','2026-01-01');`);
    const untouched = sentinels();
    // COPY recibe el CSV original por stdin del cliente: no deriva la referencia del codec.
    run('psql', [...connection, '-c', `COPY reference_rows(${columns}) FROM STDIN WITH (FORMAT csv, HEADER true)`], csv);
    assert.equal(Number(query('SELECT count(*) FROM reference_rows;')), 250);
    assert.equal(JSON.parse(query(retirement.restore)).restored, 250);
    assert.equal(differences(), 0);
    cases.push('250 rows and all six fields equal the original CSV in PostgreSQL');

    const preview = JSON.parse(query(retirement.preview));
    assert.equal(preview.matched, 250); assert.equal(preview.original_rows_removed, 0); assert.equal(differences(), 0);
    cases.push('generated preview is read-only and matches exactly the backed-up batch');
    const deleted = JSON.parse(query(retirement.apply));
    assert.equal(deleted.removed, 250); assert.equal(deleted.changed_or_missing, 0);
    assert.deepEqual(deleted.removed_keys.sort(), rows.map(row => row.cache_key).sort());
    assert.equal(Number(query(`SELECT count(*) FROM api_cache_entries WHERE ${selected};`)), 0);
    assert.equal(JSON.parse(query(retirement.restore)).restored, 250);
    assert.equal(differences(), 0);
    cases.push('downloaded backup restores exactly after committed local deletion');
    assert.equal(JSON.parse(query(retirement.restore)).restored, 0);
    assert.equal(differences(), 0); assert.equal(Number(query('SELECT count(*) FROM api_cache_entries;')), 252);
    cases.push('repeated restoration does not duplicate or overwrite rows');

    const key = literal(rows[0].cache_key);
    const retained = query(`BEGIN; UPDATE api_cache_entries SET payload='{"renewed":true}',updated_at=updated_at+interval '1 day' WHERE cache_key=${key};
      ${insert(rows)} SELECT payload='{"renewed":true}'::jsonb FROM api_cache_entries WHERE cache_key=${key}; ROLLBACK;`);
    assert.equal(retained, 't'); assert.equal(differences(), 0);
    cases.push('an existing renewed row is preserved instead of overwritten');
    assert.throws(() => query(`BEGIN; DELETE FROM api_cache_entries WHERE cache_key=${key};
      INSERT INTO api_cache_entries VALUES('invalid','operational-store-event','invalid-json',now(),now(),now()); COMMIT;`), /LOCAL_PG_OPERATION/);
    assert.equal(differences(), 0);
    cases.push('failed transaction rolls back its earlier local deletion');

    query(`UPDATE api_cache_entries SET payload='{"changed_without_metadata":true}' WHERE cache_key=${key};
      UPDATE api_cache_entries SET created_at=created_at+interval '1 microsecond' WHERE cache_key=${literal(rows[1].cache_key)};
      DELETE FROM api_cache_entries WHERE cache_key=${literal(rows[2].cache_key)};`);
    const guarded = JSON.parse(query(retirement.apply));
    assert.equal(guarded.removed, 247); assert.equal(guarded.changed_or_missing, 3);
    assert.equal(query(`SELECT payload->>'changed_without_metadata' FROM api_cache_entries WHERE cache_key=${key};`), 'true');
    assert.equal(JSON.parse(query(retirement.restore)).restored, 248);
    assert.equal(differences(), 4); // Dos filas modificadas aparecen una vez en cada lado de EXCEPT ALL.
    query(`UPDATE api_cache_entries c SET payload=s.payload,created_at=s.created_at FROM reference_rows s WHERE c.cache_key=s.cache_key;`);
    assert.equal(differences(), 0);
    cases.push('payload-only changes, changed creation timestamps and missing rows are excluded from retirement');

    const edge = { ...rows[0], cache_key: "edge:quote'comma,\nline", payload: '{"large":9007199254740993,"decimal":12345678901234567890.123456,"null":null,"text":"quote\\\"\\nline"}',
      expires_at: '2026-10-01T01:02:03.123456Z', created_at: '2026-09-29T01:02:03.654321Z', updated_at: '2026-09-29T01:02:03.654321Z' };
    const edgeExpected = { ...expected, selection: [{ cache_key: edge.cache_key, scope: edge.scope, expires_at: edge.expires_at, updated_at: edge.updated_at }] };
    const edgeBackup = buildTelemetryBackup([edge], edgeExpected);
    const edgeRows = verifyTelemetryBackup(edgeBackup.manifest, edgeBackup.gzipBytes, edgeExpected);
    assert.deepEqual(edgeRows, [edge]);
    const edgeRetirement = prepareBackedTelemetryRetention(edgeBackup, edgeExpected);
    assert.equal(JSON.parse(query('SET standard_conforming_strings=off;' + edgeRetirement.restore)).restored, 1);
    assert.equal(query(`SELECT payload->>'large' FROM api_cache_entries WHERE cache_key=${literal(edge.cache_key)};`), '9007199254740993');
    assert.equal(query(`SELECT payload->>'decimal' FROM api_cache_entries WHERE cache_key=${literal(edge.cache_key)};`), '12345678901234567890.123456');
    assert.equal(query(`SELECT to_char(expires_at AT TIME ZONE 'UTC','US') FROM api_cache_entries WHERE cache_key=${literal(edge.cache_key)};`), '123456');
    assert.equal(query(`SELECT payload->'null'='null'::jsonb FROM api_cache_entries WHERE cache_key=${literal(edge.cache_key)};`), 't');
    cases.push('large JSON numbers, decimals, null, escaped keys and microseconds survive PG17');
    const edgeDeleted = JSON.parse(query('SET standard_conforming_strings=off;' + edgeRetirement.apply));
    assert.equal(edgeDeleted.removed, 1);
    assert.equal(differences(), 0);
    cases.push('dollar-quoted retirement preserves escaped JSON independently of session string settings');
    assert.equal(sentinels(), untouched);
    cases.push('active cache, other scopes, prices, users and history remain unchanged');
    receipt = { completedAt: new Date().toISOString(), postgresVersion: version, sampleRows: 250, restoredFields: 6,
      cases, casesPassed: cases.length, exactSampleRestore: true, sourceCsvSha256: hash(csv), manifestSha256: hash(manifestBytes),
      committedDeleteRestoreLocalOnly: true, restoredFromDownloadedObjects: true, durationMs: Math.round(performance.now() - startedAt),
      localOnly: true, productionRestore: false, originalRowsRemoved: 0, physicalSavingProven: false, clusterDirectory: local };
  } finally {
    if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
  }
  await fs.writeFile(path.resolve(args[3]), JSON.stringify({ ...receipt, clusterStopped: true }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ sampleRows: 250, casesPassed: receipt.casesPassed, restoredFields: 6, localOnly: true,
    originalRowsRemoved: 0, clusterStopped: true }));
} catch (error) {
  const reason = error instanceof Error && /^[A-Z_0-9]+$/.test(error.message) ? error.message : 'TELEMETRY_RESTORE_FAILED';
  console.error(JSON.stringify({ success: false, reason, productionRestore: false, originalRowsRemoved: 0 }));
  process.exitCode = 1;
}
