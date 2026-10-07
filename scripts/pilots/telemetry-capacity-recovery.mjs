// Ensayo físico PG17 local: socket privado sin TCP, sin env del proyecto ni conexión remota.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

const pg = '/opt/homebrew/opt/postgresql@17/bin/';
const childEnv = { PATH: '/opt/homebrew/bin:/usr/bin:/bin', LC_ALL: 'C' };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const root = path.resolve(import.meta.dirname, '../..');
const source = path.join(root, 'tmp/respaldo-telemetria-2026-10-07/source');
const sourceHash = 'ecc578528d2d249d3ac7e04b501c65da2a66d292a610290b13854a432fa5b280';
const allowedOutput = path.join(root, 'tmp/capacidad-2026-10-07');

async function main() {
  assert.equal(process.argv.length, 3, 'CAPACITY_ARGUMENTS');
  const output = path.resolve(process.argv[2]);
  assert.equal(path.dirname(output), allowedOutput, 'CAPACITY_OUTPUT_SCOPE');
  assert.match(path.basename(output), /^recovery-local-[a-zA-Z0-9-]+\.json$/, 'CAPACITY_OUTPUT_NAME');
  const sourcePath = await fs.realpath(path.join(source, 'source.csv'));
  assert.ok(sourcePath.startsWith(source + path.sep), 'CAPACITY_SOURCE_SCOPE');
  assert.ok((await fs.stat(sourcePath)).size < 4 * 1024 * 1024, 'CAPACITY_SOURCE_BUDGET');
  const csv = await fs.readFile(sourcePath);
  assert.equal(hash(csv), sourceHash, 'CAPACITY_SOURCE_HASH');

  const local = await fs.mkdtemp(path.join(os.tmpdir(), 'comparador-capacity-'));
  await fs.chmod(local, 0o700);
  const data = path.join(local, 'data');
  const socket = path.join(local, 'socket');
  await fs.mkdir(socket, { mode: 0o700 });
  const run = (binary, args, input) => {
    try {
      return execFileSync(pg + binary, args, { env: childEnv, input, encoding: 'utf8',
        timeout: 30000, maxBuffer: 2 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch { throw new Error('CAPACITY_LOCAL_PG_OPERATION'); }
  };
  const connection = ['-h', socket, '-p', '55489', '-U', 'postgres', '-d', 'capacity_local', '-X', '-Atq', '-v', 'ON_ERROR_STOP=1'];
  const query = sql => run('psql', connection, sql).trim();
  const measurement = table => JSON.parse(query(`SELECT jsonb_build_object(
    'rows',(SELECT count(*) FROM ${table}), 'heapBytes',pg_relation_size('${table}'),
    'tableBytes',pg_table_size('${table}'),'indexBytes',pg_indexes_size('${table}'),
    'totalBytes',pg_total_relation_size('${table}'),'databaseBytes',pg_database_size(current_database()),
    'heapReusableBytes',(SELECT coalesce(sum(avail),0) FROM pg_freespace('${table}')),
    'indexes',(SELECT jsonb_agg(jsonb_build_object('name',i.relname,'bytes',pg_relation_size(i.oid)) ORDER BY i.relname)
      FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid WHERE x.indrelid='${table}'::regclass));`));
  const phases = [];
  const timed = (name, sql, table) => {
    const begin = performance.now();
    query(sql);
    const wallMs = Math.round((performance.now() - begin) * 100) / 100;
    const result = { name, wallMs, ...measurement(table) };
    phases.push(result);
    return result;
  };
  let started = false, receipt;
  const startedAt = new Date().toISOString();
  try {
    run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-locale', '--encoding=UTF8']);
    const log = path.join(local, 'server.log');
    await fs.writeFile(log, '', { flag: 'wx', mode: 0o600 });
    // El puerto sólo identifica el socket UNIX dentro del directorio nuevo; no abre TCP.
    run('pg_ctl', ['-D', data, '-l', log, '-o', `-h '' -p 55489 -k ${socket} -c autovacuum=off -c cluster_name=capacity-local`, '-w', 'start']);
    started = true;
    run('createdb', ['-h', socket, '-p', '55489', '-U', 'postgres', 'capacity_local']);
    assert.equal(query('SHOW data_directory;'), data, 'CAPACITY_CLUSTER_DIRECTORY');
    assert.equal(query('SHOW cluster_name;'), 'capacity-local', 'CAPACITY_CLUSTER_IDENTITY');
    assert.equal(query('SHOW listen_addresses;'), '', 'CAPACITY_NO_TCP');
    const postgresVersion = query('SHOW server_version;');
    assert.match(postgresVersion, /^17\./, 'CAPACITY_PG_VERSION');
    query(`CREATE EXTENSION pg_freespacemap;
      CREATE TABLE sample(cache_key text PRIMARY KEY,scope text NOT NULL,payload jsonb NOT NULL,
        expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL);
      CREATE INDEX sample_expires_idx ON sample(expires_at);
      CREATE INDEX sample_scope_idx ON sample(scope);
      CREATE TABLE reference_rows(LIKE sample);
      CREATE TABLE sentinels(name text PRIMARY KEY,value text NOT NULL);
      INSERT INTO sentinels VALUES('users','preserved'),('prices','preserved'),('history','preserved');`);
    run('psql', [...connection, '-c', 'COPY reference_rows FROM STDIN WITH(FORMAT csv,HEADER true)'], csv);
    assert.equal(Number(query('SELECT count(*) FROM reference_rows;')), 250, 'CAPACITY_SAMPLE_COUNT');
    const sampleBegin = timed('sample-populated', `INSERT INTO sample SELECT * FROM reference_rows;
      INSERT INTO sample VALUES('sentinel-active','operational-store-event','{}','2030-01-01','2026-10-07','2026-10-07');`, 'sample');
    const sampleDeleted = timed('sample-delete-250', 'DELETE FROM sample WHERE cache_key IN(SELECT cache_key FROM reference_rows);', 'sample');
    assert.equal(sampleDeleted.rows, 1, 'CAPACITY_SAMPLE_DELETE_COUNT');
    assert.equal(sampleDeleted.totalBytes, sampleBegin.totalBytes, 'CAPACITY_DELETE_IS_NOT_SHRINK');
    const sampleVacuum = timed('sample-vacuum-no-truncate', 'VACUUM(TRUNCATE false,INDEX_CLEANUP on) sample;', 'sample');
    const sampleRestored = timed('sample-restore-250', 'INSERT INTO sample SELECT * FROM reference_rows;', 'sample');
    assert.equal(sampleRestored.rows, 251, 'CAPACITY_RESTORED_COUNT');
    assert.equal(Number(query(`SELECT count(*) FROM ((SELECT * FROM reference_rows EXCEPT ALL
      SELECT * FROM sample WHERE cache_key IN(SELECT cache_key FROM reference_rows)) UNION ALL
      (SELECT * FROM sample WHERE cache_key IN(SELECT cache_key FROM reference_rows) EXCEPT ALL SELECT * FROM reference_rows)) d;`)), 0, 'CAPACITY_EXACT_SAMPLE_RESTORE');

    query(`CREATE TABLE synthetic(cache_key text PRIMARY KEY,scope text NOT NULL,payload jsonb NOT NULL,
      expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL)
      WITH(fillfactor=100);
      CREATE INDEX synthetic_expires_idx ON synthetic(expires_at);
      CREATE INDEX synthetic_scope_idx ON synthetic(scope);`);
    const insertSynthetic = condition => `INSERT INTO synthetic SELECT 'synthetic:'||lpad(g::text,5,'0'),
      CASE WHEN g%10=0 THEN 'operational-endpoint-event' ELSE 'operational-store-event' END,
      jsonb_build_object('text',(SELECT string_agg(md5(g::text||':'||j::text),'') FROM generate_series(1,16)j)),
      '2026-10-01'::timestamptz+g*interval '1 second','2026-09-29'::timestamptz+g*interval '1 second',
      '2026-09-29'::timestamptz+g*interval '1 second' FROM generate_series(1,20000)g ${condition};`;
    const populated = timed('synthetic-populated-20000', insertSynthetic(''), 'synthetic');
    const survivors = () => query(`SELECT md5(string_agg(md5(t::text),'' ORDER BY cache_key)) FROM synthetic t
      WHERE substring(cache_key FROM 11)::integer%10=0;`);
    const unchanged = survivors();
    const removeSynthetic = "DELETE FROM synthetic WHERE substring(cache_key FROM 11)::integer%10<>0;";
    const deleted = timed('synthetic-delete-interleaved-18000', removeSynthetic, 'synthetic');
    assert.equal(deleted.rows, 2000, 'CAPACITY_SYNTHETIC_DELETE_COUNT');
    assert.equal(deleted.totalBytes, populated.totalBytes, 'CAPACITY_SYNTHETIC_DELETE_IS_NOT_SHRINK');
    const vacuumed = timed('synthetic-vacuum-no-truncate', 'VACUUM(TRUNCATE false,INDEX_CLEANUP on) synthetic;', 'synthetic');
    assert.ok(vacuumed.heapReusableBytes > populated.heapReusableBytes, 'CAPACITY_REUSABLE_INCREASE');
    assert.equal(vacuumed.heapBytes, populated.heapBytes, 'CAPACITY_VACUUM_NO_REWRITE');
    const reused = timed('synthetic-reinsert-same-18000', insertSynthetic('WHERE g%10<>0'), 'synthetic');
    assert.equal(reused.rows, 20000, 'CAPACITY_SYNTHETIC_REINSERT_COUNT');
    assert.ok(reused.heapBytes < populated.heapBytes + vacuumed.heapReusableBytes, 'CAPACITY_HEAP_REUSE');
    assert.equal(survivors(), unchanged, 'CAPACITY_SURVIVORS_AFTER_REUSE');
    timed('synthetic-delete-again-18000', removeSynthetic, 'synthetic');
    const beforeFull = timed('synthetic-standard-vacuum', 'VACUUM(INDEX_CLEANUP on) synthetic;', 'synthetic');
    const full = timed('synthetic-vacuum-full', 'VACUUM(FULL) synthetic;', 'synthetic');
    assert.equal(full.rows, 2000, 'CAPACITY_FULL_COUNT');
    assert.ok(full.totalBytes < beforeFull.totalBytes, 'CAPACITY_FULL_SHRINK');
    assert.equal(survivors(), unchanged, 'CAPACITY_SURVIVORS_AFTER_FULL');
    assert.equal(Number(query("SELECT count(*) FROM sentinels WHERE value='preserved';")), 3, 'CAPACITY_SENTINELS');
    assert.equal(query("SELECT payload='{}'::jsonb FROM sample WHERE cache_key='sentinel-active';"), 't', 'CAPACITY_ACTIVE_SAMPLE');
    receipt = { startedAt, completedAt: new Date().toISOString(), postgresVersion, localOnly: true,
      noTcp: true, projectEnvironmentRead: false, productionChanges: false, sourceCsvSha256: sourceHash,
      sampleRows: 250, exactSampleRestore: true, syntheticRows: 20000, syntheticRetired: 18000,
      autovacuumDisabledInOwnClusterOnly: true, phases,
      results: { sampleDeleteReturnedBytes: sampleBegin.totalBytes-sampleDeleted.totalBytes,
        sampleVacuumReusableHeapBytes: sampleVacuum.heapReusableBytes,
        syntheticVacuumReusableHeapBytes: vacuumed.heapReusableBytes,
        syntheticReinsertHeapGrowthBytes: reused.heapBytes-populated.heapBytes,
        syntheticFullReturnedTableAndIndexBytes: beforeFull.totalBytes-full.totalBytes,
        syntheticFullDatabaseDeltaBytes: beforeFull.databaseBytes-full.databaseBytes },
      limits: ['Synthetic interleaved distribution and payload are not a production bloat estimate.',
        '250 original rows verify sample behaviour, not whole-cache savings.',
        'FSM free bytes are local heap estimates; do not include all reusable index/TOAST bytes.',
        'VACUUM FULL needs exclusive access and temporary disk; peak disk/production locks not measured.',
        'Wall time includes client overhead; CPU, network and remote query throughput not benchmarked.',
        'Gzip/CSV sizes are not projected to PostgreSQL capacity.'],
      clusterDirectory: local, clusterStopped: false };
  } finally {
    if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
  }
  receipt.clusterStopped = true;
  await fs.writeFile(output, JSON.stringify(receipt,null,2)+'\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ localOnly: true, noTcp: true, clusterStopped: true, exactSampleRestore: true,
    syntheticRows: receipt.syntheticRows, results: receipt.results, output }));
}

try { await main(); }
catch(error) {
  console.error(JSON.stringify({ success:false, reason:error instanceof Error && /^[A-Z_0-9]+$/.test(error.message)
    ? error.message : 'CAPACITY_LOCAL_FAILED', productionChanges:false }));
  process.exitCode=1;
}
