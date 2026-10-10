// Cluster PG17 propio sin TCP; no lee env de proyecto ni acepta conexiones externas.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const pg = '/opt/homebrew/opt/postgresql@17/bin/';
const root = path.resolve(import.meta.dirname, '..');
const local = fs.mkdtempSync(path.join(os.tmpdir(), 'comparador-sort-'));
const data = path.join(local, 'data'), socket = path.join(local, 'socket');
fs.mkdirSync(socket, { mode: 0o700 });
const env = { PATH: '/usr/bin:/bin', LANG: 'C' };
const run = (cmd, args, input) => execFileSync(pg + cmd, args, {
  input, env, encoding: 'utf8', timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024,
});
const args = ['-X', '-h', socket, '-p', '55494', '-U', 'postgres', '-d', 'catalog_sort_local', '-v', 'ON_ERROR_STOP=1', '-Atq'];
const query = sql => run('psql', args, sql);
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const migration = '20261010204500_reduce_catalog_sort_payload.sql';
const signatures = "'public.search_catalog_page(text,text,text[],numeric,numeric,text,integer,integer)'::regprocedure,'public.catalog_matches_prepared(text,text,text,text,text[],text[],text,text,boolean)'::regprocedure,'public.catalog_matches_query(text,text,text,text)'::regprocedure";
const snapshotSql = `select jsonb_agg(jsonb_build_object('oid',oid,'body',prosrc,'acl',proacl,'config',proconfig,'invoker',not prosecdef,'defaultArgs',pronargdefaults,'parallel',proparallel,'volatile',provolatile) order by oid) from pg_proc where oid in (${signatures});`;
let started = false;
try {
  run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-locale', '--encoding=UTF8']);
  run('pg_ctl', ['-D', data, '-l', path.join(local, 'postgres.log'), '-o', `-h '' -k ${socket} -p 55494 -c cluster_name=sort-local`, '-w', 'start']);
  started = true;
  run('createdb', ['-h', socket, '-p', '55494', '-U', 'postgres', 'catalog_sort_local']);
  assert.equal(query('SHOW listen_addresses;').trim(), '');
  assert.equal(query('SHOW data_directory;').trim(), data);
  query(read('supabase/tests/bootstrap-local.sql'));
  for (const name of fs.readdirSync(path.join(root, 'supabase/migrations')).filter(name => name.endsWith('.sql') && name < migration).sort()) {
    query(read('supabase/migrations/' + name));
  }
  const before = query(snapshotSql).trim();
  const baseline = query("select pg_get_functiondef('public.search_catalog_page(text,text,text[],numeric,numeric,text,integer,integer)'::regprocedure);");
  query(baseline.replace('public.search_catalog_page(', 'public.search_catalog_page_baseline('));
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
  const equality = `do $$ declare c record; a jsonb; b jsonb; cases integer:=0; begin
    for c in select * from (values
      ('',null::text,null::numeric,null::numeric),('','perifericos',100000::numeric,200000::numeric),
      ('Fastpath','perifericos',0::numeric,null::numeric),('rtx',null,0::numeric,null::numeric),
      ('7600',null,0::numeric,null::numeric),('ddr5 32GB 2x16GB 6000','memoria-ram',0::numeric,null::numeric),
      ('ryzen 5 5600','procesadores',0::numeric,null::numeric)
    ) q(query,category,min_price,max_price)
    cross join unnest(array['relevance','price-asc','price-desc','name','newest']) sort
    cross join (values ('{}'::text[]), (array['mexx']), (array['venex'])) stores(value)
    loop
      a:=public.search_catalog_page_baseline(c.query,c.category,c.value,c.min_price,c.max_price,c.sort,2,2);
      b:=public.search_catalog_page(c.query,c.category,c.value,c.min_price,c.max_price,c.sort,2,2);
      assert a=b,format('Contrato de orden/total/precio distinto: %s',to_jsonb(c));
      cases:=cases+1;
    end loop;
    raise notice '% comparaciones JSON exactas',cases;
  end $$;`;
  for (const name of ['ram_catalog_search.sql','numeric_catalog_search.sql','prepared_catalog_matching.sql','paginated_catalog.sql','current_offer_evidence.sql','current_catalog_price_fastpath.sql']) {
    const startedAt = performance.now();
    const fixture = read('supabase/tests/' + name);
    query(fixture.replace(/rollback;\s*$/i, () => equality+'\nrollback;'));
    console.log(JSON.stringify({ test: name, passed: true, exactComparisons: 105, elapsedMs: Math.round(performance.now() - startedAt) }));
  }
  // La guarda rechaza re-aplicar y rechaza revertir si otro cambio intervino.
  assert.throws(() => query(read('supabase/migrations/' + migration)), /antes de optimizar/);
  const candidate = query("select pg_get_functiondef('public.search_catalog_page(text,text,text[],numeric,numeric,text,integer,integer)'::regprocedure);");
  query(candidate.replace('begin', 'begin\n  -- Drift local de prueba.'));
  assert.throws(() => query(read('supabase/tests/catalog_sort_payload.rollback.sql')), /antes de revertir/);
  query(candidate);
  query(read('supabase/tests/catalog_sort_payload.rollback.sql'));
  assert.equal(query(snapshotSql).trim(), before, 'Rollback exacto de cuerpo/OID/ACL/configuración');
  console.log(JSON.stringify({ localOnly: true, noTcp: true, rollbackExact: true, productionWrites: false, postgres: query('SHOW server_version;').trim() }));
} finally {
  if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
  fs.rmSync(local, { recursive: true, force: true });
}
