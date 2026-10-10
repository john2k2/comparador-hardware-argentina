// Cluster PG17 propio sin TCP; no lee env de proyecto ni acepta conexiones externas.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const pg = '/opt/homebrew/opt/postgresql@17/bin/';
const root = path.resolve(import.meta.dirname, '..');
const local = fs.mkdtempSync(path.join(os.tmpdir(), 'comparador-restricted-'));
const data = path.join(local, 'data'), socket = path.join(local, 'socket');
fs.mkdirSync(socket, { mode: 0o700 });
const env = { PATH: '/usr/bin:/bin', LANG: 'C' };
const run = (cmd, args, input) => execFileSync(pg + cmd, args, {
  input, env, encoding: 'utf8', timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024,
});
const args = ['-X', '-h', socket, '-p', '55494', '-U', 'postgres', '-d', 'catalog_restricted_local', '-v', 'ON_ERROR_STOP=1', '-Atq'];
const query = sql => run('psql', args, sql);
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const migration = '20261010205000_guard_restricted_offer_purchase.sql';
const signatures = "'public.catalog_offer_is_comparable(numeric,text,text,jsonb,text,text,jsonb,text)'::regprocedure";
const snapshotSql = `select jsonb_agg(jsonb_build_object('oid',oid,'body',prosrc,'acl',proacl,'config',proconfig,'invoker',not prosecdef,'defaultArgs',pronargdefaults,'parallel',proparallel,'volatile',provolatile) order by oid) from pg_proc where oid in (${signatures});`;
let started = false;
try {
  run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-locale', '--encoding=UTF8']);
  run('pg_ctl', ['-D', data, '-l', path.join(local, 'postgres.log'), '-o', `-h '' -k ${socket} -p 55494 -c cluster_name=restricted-local`, '-w', 'start']);
  started = true;
  run('createdb', ['-h', socket, '-p', '55494', '-U', 'postgres', 'catalog_restricted_local']);
  assert.equal(query('SHOW listen_addresses;').trim(), '');
  assert.equal(query('SHOW data_directory;').trim(), data);
  query(read('supabase/tests/bootstrap-local.sql'));
  for (const name of fs.readdirSync(path.join(root, 'supabase/migrations')).filter(name => name.endsWith('.sql') && name < migration).sort()) {
    query(read('supabase/migrations/' + name));
  }
  const before = query(snapshotSql).trim();
  const ramTests = read('supabase/tests/restricted_offer_purchase.sql');
  const rejectedBefore = () => {
    try { query(ramTests); return false; }
    catch (error) { return String(error.stderr).includes('Restricted individual purchase must be rejected'); }
  };
  assert.ok(rejectedBefore(), 'Reproducir la compra restringida admitida antes del guard');
  query(read('supabase/migrations/' + migration));
  assert.throws(() => query(read('supabase/migrations/' + migration)), /Restricted purchase: catalog_offer_is_comparable cambió/, 'Reaplicación bloqueada sin modificar función');
  const after = JSON.parse(query(snapshotSql));
  const prior = JSON.parse(before);
  for (let index = 0; index < prior.length; index++) {
    assert.equal(after[index].oid, prior[index].oid);
    assert.deepEqual(after[index].acl, prior[index].acl);
    assert.deepEqual(after[index].config, prior[index].config);
    for (const field of ['defaultArgs', 'parallel', 'volatile']) assert.equal(after[index][field], prior[index][field]);
    assert.equal(after[index].invoker, true);
  }
  // Reproducir el P2 aislado: fuente principal válida + restricción null en review.
  const candidateFunction = query("select pg_get_functiondef('public.catalog_offer_is_comparable(numeric,text,text,jsonb,text,text,jsonb,text)'::regprocedure);");
  const reviewPropertyGuard = / if \(p_review->'sourceIdentity'\) \? 'purchaseRestriction' and not coalesce\([\s\S]*?then return false; end if;/;
  assert.ok(reviewPropertyGuard.test(candidateFunction));
  query(candidateFunction.replace(reviewPropertyGuard, ''));
  assert.throws(() => query(ramTests), /Metadata malformada en review se rechaza aun con fuente principal válida/);
  query(candidateFunction);
  for (const name of ['restricted_offer_purchase.sql', 'current_offer_evidence.sql', 'ram_catalog_search.sql', 'paginated_catalog.sql']) {
    const startedAt = performance.now();
    query(read('supabase/tests/' + name));
    console.log(JSON.stringify({ test: name, passed: true, elapsedMs: Math.round(performance.now() - startedAt) }));
  }
  // Drift posterior no puede ser reemplazado por una reversión del candidato.
  const candidateMatcher = query("select pg_get_functiondef('public.catalog_offer_is_comparable(numeric,text,text,jsonb,text,text,jsonb,text)'::regprocedure);");
  query(candidateMatcher.replace('begin', 'begin\n  -- Drift de prueba local.'));
  assert.throws(() => query(read('supabase/tests/restricted_offer_purchase.rollback.sql')), /Restricted purchase rollback: catalog_offer_is_comparable cambió/);
  query(candidateMatcher);
  query("alter function public.catalog_offer_is_comparable(numeric,text,text,jsonb,text,text,jsonb,text) set search_path=public;");
  assert.throws(() => query(read('supabase/tests/restricted_offer_purchase.rollback.sql')), /contrato de seguridad\/configuración cambió/);
  query(candidateMatcher);
  query(read('supabase/tests/restricted_offer_purchase.rollback.sql'));
  assert.equal(query(snapshotSql).trim(), before, 'Rollback exacto de cuerpo/OID/ACL/configuración');
  assert.ok(rejectedBefore(), 'Reproducir el defecto tras revertir');
  console.log(JSON.stringify({ localOnly: true, noTcp: true, rollbackExact: true, productionWrites: false, postgres: query('SHOW server_version;').trim() }));
} finally {
  if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
  fs.rmSync(local, { recursive: true, force: true });
}
