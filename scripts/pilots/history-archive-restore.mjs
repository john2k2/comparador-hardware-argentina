// Recuperación exclusivamente en un cluster PG17 propio. Nunca acepta conexión remota.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { buildHistoryArchive, verifyHistoryArchive, readHistoryArchiveSelection } from '../lib/history-archive.mjs';

const args = process.argv.slice(2);
assert.equal(args.length, 2, 'Use history-archive-restore.mjs <archive-directory> <report-file>');
const archiveDir = await fs.realpath(args[0]);
const reportFile = path.resolve(args[1]);
const expected = { projectId: 'zyiyziubpcpgoqlkcrie', cutoff: '2026-07-09T00:00:00.000000Z', snapshotAt: '2026-10-07T19:16:07.876892Z' };
const manifest = JSON.parse(await fs.readFile(path.join(archiveDir, 'manifest.json'), 'utf8'));
const fetchChunk = async name => {
  const file = await fs.realpath(path.resolve(archiveDir, name));
  assert.ok(file.startsWith(archiveDir + path.sep));
  assert.ok((await fs.stat(file)).size <= 1024 * 1024);
  return fs.readFile(file);
};
const rows = await verifyHistoryArchive(manifest, fetchChunk, expected);
assert.ok(rows.length > 0, 'La muestra real debe contener observaciones');
const pg = '/opt/homebrew/opt/postgresql@17/bin/';
const env = { PATH: '/opt/homebrew/bin:/usr/bin:/bin', LC_ALL: 'C' };
const local = await fs.mkdtemp(path.join(os.tmpdir(), 'comparador-history-restore-'));
const data = path.join(local, 'data');
const port = '55486';
const connection = ['-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', 'history_archive_local', '-X', '-Atq', '-v', 'ON_ERROR_STOP=1'];
const run = (binary, argv, input) => execFileSync(pg + binary, argv, { env, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 });
const query = sql => run('psql', connection, sql).trim();
const literal = value => "'" + value.replaceAll("'", "''") + "'";
const recordset = input => `jsonb_to_recordset(${literal(JSON.stringify(input))}::jsonb) AS x(id text,product_id text,store_id text,price text,original_price text,stock text,recorded_at text,offer_url text)`;
const insert = input => `INSERT INTO price_history SELECT id::uuid,product_id,store_id,price::numeric,original_price::numeric,stock,recorded_at::timestamptz,offer_url FROM ${recordset(input)} ON CONFLICT(id) DO NOTHING;`;
const actualRows = () => JSON.parse(query(`SELECT coalesce(jsonb_agg(jsonb_build_object('id',id::text,'product_id',product_id,'store_id',store_id,
  'price',price::text,'original_price',original_price::text,'stock',stock,'recorded_at',to_char(recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'offer_url',offer_url)
  ORDER BY recorded_at,id),'[]'::jsonb) FROM price_history;`));
const sentinel = () => query("SELECT jsonb_build_object('prices',(SELECT jsonb_agg(t) FROM product_prices t),'users',(SELECT jsonb_agg(t) FROM user_profiles t),'cache',(SELECT jsonb_agg(t) FROM api_cache_entries t));");
let started = false;
const cases = [];
const start = performance.now();
try {
  try { run('pg_isready', ['-h', '127.0.0.1', '-p', port]); throw new Error('LOCAL_PORT_IN_USE'); }
  catch (error) { if (error.status !== 2) throw error; }
  run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-locale', '--encoding=UTF8']);
  run('pg_ctl', ['-D', data, '-l', path.join(local, 'server.log'), '-o', `-h 127.0.0.1 -p ${port} -c unix_socket_directories='' -c cluster_name=history-archive-pilot-local`, '-w', 'start']);
  started = true;
  run('createdb', ['-h', '127.0.0.1', '-p', port, '-U', 'postgres', 'history_archive_local']);
  assert.equal(query('SHOW cluster_name;'), 'history-archive-pilot-local');
  const version = query('SHOW server_version;'); assert.match(version, /^17\./);
  query(`SET standard_conforming_strings=on;
    CREATE TABLE products(id text PRIMARY KEY); CREATE TABLE stores(id text PRIMARY KEY);
    CREATE TABLE price_history(id uuid PRIMARY KEY,product_id text NOT NULL REFERENCES products(id) ON UPDATE CASCADE ON DELETE CASCADE,
      store_id text NOT NULL REFERENCES stores(id) ON UPDATE CASCADE ON DELETE RESTRICT,
      price numeric(14,2) NOT NULL CHECK(price>=0),original_price numeric(14,2),stock text NOT NULL CHECK(stock IN('in-stock','low-stock','out-of-stock','unknown')),
      recorded_at timestamptz NOT NULL,offer_url text);
    CREATE TABLE product_prices(id text,price numeric); INSERT INTO product_prices VALUES('sentinel',123);
    CREATE TABLE user_profiles(id text); INSERT INTO user_profiles VALUES('synthetic-user');
    CREATE TABLE api_cache_entries(id text); INSERT INTO api_cache_entries VALUES('synthetic-cache');
    INSERT INTO products SELECT DISTINCT product_id FROM ${recordset(rows)};
    INSERT INTO stores SELECT DISTINCT store_id FROM ${recordset(rows)};`);
  const untouched = sentinel();
  await assert.rejects(verifyHistoryArchive(manifest, async () => undefined, expected));
  await assert.rejects(verifyHistoryArchive(manifest, async () => Buffer.from('broken'), expected));
  assert.equal(query('SELECT count(*) FROM price_history;'), '0');
  cases.push('missing/corrupt archive rejected before any restore');
  query(`BEGIN;${insert(rows.slice(0, 5))}ROLLBACK;`);
  assert.equal(query('SELECT count(*) FROM price_history;'), '0');
  cases.push('interrupted transaction preserves empty destination');
  query(`BEGIN;${insert(rows)}COMMIT;`);
  assert.deepEqual(actualRows(), rows);
  cases.push('real sample restored with all eight fields and foreign keys');
  query(`BEGIN;${insert(rows)}COMMIT;`);
  assert.deepEqual(actualRows(), rows);
  cases.push('repeated restore does not duplicate or replace rows');
  const edgeRows = [{ ...rows[0], id: '00000000-0000-0000-0000-000000000001', price: '999999999999.99', original_price: '-999999999999.99',
    recorded_at: '2026-03-05T01:51:12.123456Z', offer_url: "https://example.com/a,b?quote='x'\nnext", stock: 'unknown' }];
  const edgeArchive = buildHistoryArchive(edgeRows, expected);
  const edge = await verifyHistoryArchive(edgeArchive.manifest, async name => edgeArchive.chunks.get(name), expected);
  query(`BEGIN;${insert(edge)}COMMIT;`);
  assert.deepEqual(actualRows().filter(row => row.id === edge[0].id), edge);
  cases.push('maximum signed decimal/microseconds/null/escaped text survive PG17');
  const selectedProduct = rows[0].product_id;
  let reads = 0;
  const selection = await readHistoryArchiveSelection(manifest, async name => { reads++; return fetchChunk(name); }, { productId: selectedProduct }, expected);
  assert.deepEqual(selection.rows, rows.filter(row => row.product_id === selectedProduct));
  assert.equal(reads, selection.verifiedChunks);
  assert.equal(selection.verification, 'selected-chunks');
  assert.equal(sentinel(), untouched);
  cases.push('selective history equals original; current prices/users/cache untouched');
  const receipt = { completedAt: new Date().toISOString(), postgresVersion: version, sampleRows: rows.length, restoredFields: 8,
    cases, casesPassed: cases.length, exactSampleRestore: true, selectiveChunksRead: reads, totalChunks: manifest.chunks.length,
    durationMs: Math.round(performance.now() - start), localOnly: true, productionRestore: false, originalRowsRemoved: 0, physicalReductionProven: false };
  await fs.mkdir(path.dirname(reportFile), { recursive: true });
  await fs.writeFile(reportFile, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify(receipt));
} finally {
  if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
}
