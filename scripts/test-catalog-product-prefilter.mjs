// Cluster PG17 propio sin TCP; no lee env de proyecto ni acepta conexiones externas.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const cliArgs = process.argv.slice(2);
assert.ok(cliArgs.length === 0 || (cliArgs.length === 2 && cliArgs[0] === '--postgres-bin'),
  'Uso: node scripts/test-catalog-product-prefilter.mjs [--postgres-bin /ruta/absoluta/pg17/bin]');
const pg = cliArgs[1] ?? '/opt/homebrew/opt/postgresql@17/bin/';
assert.ok(path.isAbsolute(pg), 'La ruta de PostgreSQL debe ser absoluta');
const root = path.resolve(import.meta.dirname, '..');
const local = fs.mkdtempSync(path.join(os.tmpdir(), 'comparador-prefilter-'));
const data = path.join(local, 'data'), socket = path.join(local, 'socket');
fs.mkdirSync(socket, { mode: 0o700 });
const env = { PATH: '/usr/bin:/bin', LANG: 'C' };
const run = (cmd, args, input) => execFileSync(path.join(pg, cmd), args, {
  input, env, encoding: 'utf8', timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024,
});
const args = ['-X', '-h', socket, '-p', '55503', '-U', 'postgres', '-d', 'catalog_prefilter_local', '-v', 'ON_ERROR_STOP=1', '-Atq'];
const query = sql => run('psql', args, sql);
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const migration = '20261010212131_prefilter_catalog_products.sql';
const lookupMigration = '20261010222700_narrow_catalog_search_seed.sql';
const signatures = "'public.search_catalog_page(text,text,text[],numeric,numeric,text,integer,integer)'::regprocedure,'public.catalog_matches_prepared(text,text,text,text,text[],text[],text,text,boolean)'::regprocedure,'public.catalog_matches_query(text,text,text,text)'::regprocedure";
const snapshotSql = `select jsonb_agg(jsonb_build_object('oid',oid,'body',prosrc,'acl',proacl,'config',proconfig,'invoker',not prosecdef,'defaultArgs',pronargdefaults,'parallel',proparallel,'volatile',provolatile) order by oid) from pg_proc where oid in (${signatures});`;
let started = false;
try {
  assert.match(run('postgres', ['--version']), /PostgreSQL\) 17\./);
  run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-locale', '--encoding=UTF8']);
  run('pg_ctl', ['-D', data, '-l', path.join(local, 'postgres.log'), '-o', `-h '' -k ${socket} -p 55503 -c cluster_name=prefilter-local`, '-w', 'start']);
  started = true;
  run('createdb', ['-h', socket, '-p', '55503', '-U', 'postgres', 'catalog_prefilter_local']);
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
  query(read('supabase/migrations/' + lookupMigration));
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
      ('ryzen 5 5600','procesadores',0::numeric,null::numeric),
      ('rtx',null,null::numeric,null::numeric),('ddr5','memoria-ram',null::numeric,null::numeric)
    ) q(query,category,min_price,max_price)
    cross join unnest(array['relevance','price-asc','price-desc','name','newest']) sort
    cross join (values ('{}'::text[]), (array['mexx']), (array['venex'])) stores(value)
    loop
      a:=public.search_catalog_page_baseline(c.query,c.category,c.value,c.min_price,c.max_price,c.sort,2,2);
      b:=public.search_catalog_page(c.query,c.category,c.value,c.min_price,c.max_price,c.sort,2,2);
      assert a=b,format('Contrato de orden/total/precio distinto: %s',to_jsonb(c));
      cases:=cases+1;
    end loop;
    for c in select * from (values (null::text),('perifericos'),('procesadores')) categories(category)
    cross join (values (0::numeric,null::numeric),(100000::numeric,200000::numeric),
      (null::numeric,130000::numeric),(150000::numeric,150000::numeric)) bounds(min_price,max_price)
    cross join unnest(array['relevance','price-asc','price-desc','name','newest']) sort
    cross join unnest(array[1,999]) page
    cross join unnest(array[12,48]) size
    loop
      a:=public.search_catalog_page_baseline('',c.category,'{}',c.min_price,c.max_price,c.sort,c.page,c.size);
      b:=public.search_catalog_page('',c.category,'{}',c.min_price,c.max_price,c.sort,c.page,c.size);
      assert a=b,format('Precio/paginación/fechas distintos: %s',to_jsonb(c));
      cases:=cases+1;
    end loop;
    assert cases=375;
    raise notice '% comparaciones JSON exactas',cases;
  end $$;`;
  for (const name of ['ram_catalog_search.sql','numeric_catalog_search.sql','prepared_catalog_matching.sql','paginated_catalog.sql','current_offer_evidence.sql','current_catalog_price_fastpath.sql','restricted_offer_purchase.sql']) {
    const startedAt = performance.now();
    const fixture = read('supabase/tests/' + name);
    query(fixture.replace(/rollback;\s*$/i, () => 'grant select on public.products,public.product_prices to anon; set local role anon;\n'+equality+'\nreset role; rollback;'));
    console.log(JSON.stringify({ test: name, passed: true, exactComparisons: 375, elapsedMs: Math.round(performance.now() - startedAt) }));
  }
  const seedFixture = read('supabase/tests/catalog_current_seed.sql');
  query(seedFixture.replace('do $$', () => 'grant select on public.products,public.product_prices to anon; set local role anon;\ndo $$')
    .replace(/rollback;\s*$/i, 'reset role; rollback;'));
  console.log(JSON.stringify({ test: 'catalog_current_seed.sql', passed: true, exactComparisons: 60, semanticAssertions: 5 }));
  query('drop function public.search_catalog_page_baseline(text,text,text[],numeric,numeric,text,integer,integer);');
  query(seedFixture);
  console.log(JSON.stringify({ test: 'catalog_current_seed.sql', passed: true, baselineAbsent: true, semanticAssertions: 5 }));
  query(read('supabase/tests/catalog_product_prefilter.sql'));
  console.log(JSON.stringify({ test: 'catalog_product_prefilter.sql', passed: true, necessaryConditionCases: 48 }));
  query(read('supabase/tests/catalog_search_lookup.sql'));
  console.log(JSON.stringify({ test: 'catalog_search_lookup.sql', passed: true }));
  console.log(JSON.stringify({ candidateHash: query("select md5(prosrc) from pg_proc where oid='public.search_catalog_page(text,text,text[],numeric,numeric,text,integer,integer)'::regprocedure;").trim() }));
  // La guarda rechaza re-aplicar y rechaza revertir si otro cambio intervino.
  assert.throws(() => query(read('supabase/migrations/' + lookupMigration)), /antes de optimizar/);
  const candidate = query("select pg_get_functiondef('public.search_catalog_page(text,text,text[],numeric,numeric,text,integer,integer)'::regprocedure);");
  query(candidate.replace('begin', 'begin\n  -- Drift local de prueba.'));
  assert.throws(() => query(read('supabase/tests/catalog_search_lookup.rollback.sql')), /antes de revertir/);
  query(candidate);
  query(read('supabase/tests/catalog_search_lookup.rollback.sql'));
  assert.equal(query("select to_regclass('public.products_search_lookup') is null and to_regprocedure('public.sync_products_search_lookup()') is null;").trim(), 't');
  query(read('supabase/tests/catalog_product_prefilter.rollback.sql'));
  assert.equal(query(snapshotSql).trim(), before, 'Rollback exacto de cuerpo/OID/ACL/configuración');
  console.log(JSON.stringify({ localOnly: true, noTcp: true, rollbackExact: true, productionWrites: false, postgres: query('SHOW server_version;').trim() }));
} finally {
  if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
  fs.rmSync(local, { recursive: true, force: true });
}
