// Cluster PG17 propio sin TCP; no lee env de proyecto ni acepta conexiones externas.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const pg = '/opt/homebrew/opt/postgresql@17/bin/';
const root = path.resolve(import.meta.dirname, '..');
const local = fs.mkdtempSync(path.join(os.tmpdir(), 'comparador-ram-'));
const data = path.join(local, 'data'), socket = path.join(local, 'socket');
fs.mkdirSync(socket, { mode: 0o700 });
const env = { PATH: '/usr/bin:/bin', LANG: 'C' };
const run = (cmd, args, input) => execFileSync(pg + cmd, args, {
  input, env, encoding: 'utf8', timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024,
});
const args = ['-X', '-h', socket, '-p', '55493', '-U', 'postgres', '-d', 'catalog_ram_local', '-v', 'ON_ERROR_STOP=1', '-Atq'];
const query = sql => run('psql', args, sql);
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const migration = '20261010194500_normalize_ram_query_units.sql';
const signatures = "'public.search_catalog_page(text,text,text[],numeric,numeric,text,integer,integer)'::regprocedure,'public.catalog_matches_prepared(text,text,text,text,text[],text[],text,text,boolean)'::regprocedure,'public.catalog_matches_query(text,text,text,text)'::regprocedure";
const snapshotSql = `select jsonb_agg(jsonb_build_object('oid',oid,'body',prosrc,'acl',proacl,'config',proconfig,'invoker',not prosecdef,'defaultArgs',pronargdefaults,'parallel',proparallel,'volatile',provolatile) order by oid) from pg_proc where oid in (${signatures});`;
let started = false;
try {
  run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-locale', '--encoding=UTF8']);
  run('pg_ctl', ['-D', data, '-l', path.join(local, 'postgres.log'), '-o', `-h '' -k ${socket} -p 55493 -c cluster_name=ram-local`, '-w', 'start']);
  started = true;
  run('createdb', ['-h', socket, '-p', '55493', '-U', 'postgres', 'catalog_ram_local']);
  assert.equal(query('SHOW listen_addresses;').trim(), '');
  assert.equal(query('SHOW data_directory;').trim(), data);
  query(read('supabase/tests/bootstrap-local.sql'));
  for (const name of fs.readdirSync(path.join(root, 'supabase/migrations')).filter(name => name.endsWith('.sql') && name !== migration).sort()) {
    query(read('supabase/migrations/' + name));
  }
  const before = query(snapshotSql).trim();
  const ramTests = read('supabase/tests/ram_catalog_search.sql');
  const rejectedBefore = () => {
    try { query(ramTests); return false; }
    catch (error) { return String(error.stderr).includes('RAM unidades debe encontrar tres fichas actuales'); }
  };
  assert.ok(rejectedBefore(), 'Reproducir la falta de equivalencia antes de corregir');
  query(read('supabase/migrations/' + migration));
  const after = JSON.parse(query(snapshotSql));
  const prior = JSON.parse(before);
  for (let index = 0; index < prior.length; index++) {
    assert.equal(after[index].oid, prior[index].oid);
    assert.deepEqual(after[index].acl, prior[index].acl);
    assert.deepEqual(after[index].config, prior[index].config);
    for (const field of ['defaultArgs', 'parallel', 'volatile']) assert.equal(after[index][field], prior[index][field]);
    assert.equal(after[index].invoker, true);
  }
  for (const name of ['ram_catalog_search.sql', 'numeric_catalog_search.sql', 'prepared_catalog_matching.sql', 'paginated_catalog.sql', 'current_offer_evidence.sql']) {
    const startedAt = performance.now();
    query(read('supabase/tests/' + name));
    console.log(JSON.stringify({ test: name, passed: true, elapsedMs: Math.round(performance.now() - startedAt) }));
  }
  // Drift posterior no puede ser reemplazado por una reversión del candidato.
  const candidateMatcher = query("select pg_get_functiondef('public.catalog_matches_query(text,text,text,text)'::regprocedure);");
  query(candidateMatcher.replace('begin', 'begin\n  -- Drift de prueba local.'));
  assert.throws(() => query(read('supabase/tests/ram_catalog_search.rollback.sql')), /RAM rollback: catalog_matches_query cambió/);
  query(candidateMatcher);
  query(read('supabase/tests/ram_catalog_search.rollback.sql'));
  assert.equal(query(snapshotSql).trim(), before, 'Rollback exacto de cuerpo/OID/ACL/configuración');
  assert.ok(rejectedBefore(), 'Reproducir el defecto tras revertir');
  console.log(JSON.stringify({ localOnly: true, noTcp: true, rollbackExact: true, productionWrites: false, postgres: query('SHOW server_version;').trim() }));
} finally {
  if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
  fs.rmSync(local, { recursive: true, force: true });
}
