// Laboratorio funcional aislado: fixtures sintéticas, SQL vigente y compactación sin renovar ofertas.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '../..');
export const privateRoot = path.join(root, 'tmp/restructuracion-2026-10-08');
const pg = '/opt/homebrew/opt/postgresql@17/bin/';
// No heredar PG*, credenciales ni configuración del proyecto hacia procesos propios.
const childEnv = { PATH: '/opt/homebrew/bin:/usr/bin:/bin', LC_ALL: 'C' };
const sha = value => createHash('sha256').update(value).digest('hex');
export const suiteNames = ['atomic_catalog_offers.sql', 'adaptive_observations.sql',
  'current_offer_evidence.sql', 'current_catalog_price_fastpath.sql'];

export async function validateOutput(file) {
  const resolved = path.resolve(file);
  assert.equal(path.dirname(resolved), privateRoot, 'CONTRACT_OUTPUT_SCOPE');
  assert.match(path.basename(resolved), /^contracts-[a-zA-Z0-9-]+\.json$/, 'CONTRACT_OUTPUT_NAME');
  assert.equal(await fs.realpath(privateRoot), privateRoot, 'CONTRACT_PARENT_SYMLINK');
  assert.equal((await fs.stat(privateRoot)).mode & 0o077, 0, 'CONTRACT_PRIVATE_DIRECTORY');
  return resolved;
}

export function selectMigrations(names) {
  const selected = names.filter(name => /^\d{14}_[a-z0-9_]+\.sql$/.test(name)
    && name >= '20260304235643_initial_argen_prices_schema.sql'
    && name <= '20261006024548_current_catalog_bounded_candidates_function.sql'
    && name !== '20261006002340_private_measurement_dashboard.sql').sort();
  assert.equal(selected[0], '20260304235643_initial_argen_prices_schema.sql', 'CONTRACT_INITIAL_SCHEMA');
  assert.equal(selected.at(-1), '20261006024548_current_catalog_bounded_candidates_function.sql', 'CONTRACT_CURRENT_SCHEMA');
  return selected;
}

const baselineFixture = `
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('11111111-1111-4111-8111-111111111111','contracts-a@example.invalid','{}'),
 ('22222222-2222-4222-8222-222222222222','contracts-b@example.invalid','{}');
INSERT INTO products(id,name,model,category) VALUES ('contracts-adaptive','Producto de prueba','Prueba','perifericos');
INSERT INTO product_prices(id,product_id,store_id,url,price,stock,last_updated)
 VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','contracts-adaptive','mexx','https://example.com/fixture',50,'out-of-stock',now()-interval '2 days');
INSERT INTO user_favorites(user_id,product_id) VALUES
 ('11111111-1111-4111-8111-111111111111','contracts-adaptive');
INSERT INTO price_alerts(user_id,product_id,trigger_mode,target_price) VALUES
 ('22222222-2222-4222-8222-222222222222','contracts-adaptive','target_price',20);
GRANT USAGE ON SCHEMA public TO service_role,anon,authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT SELECT ON products,product_prices,stores,categories TO anon,authenticated;
SELECT seed_catalog_refresh_queue();
`;

export const carryForwardOracle = `
BEGIN;
INSERT INTO products(id,name,model,category) VALUES
 ('contracts-index-a','AMD Ryzen 5 5600','5600','procesadores'),
 ('contracts-index-b','AMD Ryzen 5 7600','7600','procesadores'),
 ('contracts-index-out','AMD Ryzen 5 5500','5500','procesadores');
INSERT INTO product_prices(product_id,store_id,url,price,stock,last_updated) VALUES
 ('contracts-index-a','mexx','https://example.invalid/index-a',70,'in-stock',now()-interval '1 hour'),
 ('contracts-index-b','venex','https://example.invalid/index-b',200,'low-stock',now()-interval '1 hour'),
 ('contracts-index-out','mexx','https://example.invalid/index-out',1,'out-of-stock',now()-interval '1 hour');
CREATE TEMP TABLE oracle_bounds AS SELECT timezone('America/Argentina/Buenos_Aires',now())::date AS today;
INSERT INTO price_history(id,product_id,store_id,offer_url,price,stock,recorded_at)
SELECT '00000000-0000-4000-8000-000000000001','contracts-index-a','mexx','https://example.invalid/index-a',90,'in-stock',
 (today-20+time '12:00') AT TIME ZONE 'America/Argentina/Buenos_Aires' FROM oracle_bounds;
INSERT INTO price_history(id,product_id,store_id,offer_url,price,stock,recorded_at)
SELECT '00000000-0000-4000-8000-000000000002','contracts-index-a','mexx','https://example.invalid/index-a',100,'in-stock',
 (today-20+time '12:00') AT TIME ZONE 'America/Argentina/Buenos_Aires' FROM oracle_bounds;
INSERT INTO price_history(product_id,store_id,offer_url,price,stock,recorded_at)
SELECT 'contracts-index-b','venex','https://example.invalid/index-b',200,'low-stock',
 (today-20+time '12:00') AT TIME ZONE 'America/Argentina/Buenos_Aires' FROM oracle_bounds;
INSERT INTO price_history(product_id,store_id,offer_url,price,stock,recorded_at)
SELECT 'contracts-index-a','mexx','https://example.invalid/index-a',80,'in-stock',
 (today-3+time '12:00') AT TIME ZONE 'America/Argentina/Buenos_Aires' FROM oracle_bounds;
-- 02:30 UTC del día -1 es todavía el día -2 en Buenos Aires.
INSERT INTO price_history(product_id,store_id,offer_url,price,stock,recorded_at)
SELECT 'contracts-index-a','mexx','https://example.invalid/index-a',80,'out-of-stock',
 (today-1+time '02:30') AT TIME ZONE 'UTC' FROM oracle_bounds;
INSERT INTO price_history(product_id,store_id,offer_url,price,stock,recorded_at)
SELECT 'contracts-index-a','mexx','https://example.invalid/index-a',70,'in-stock',
 (today-1+time '12:00') AT TIME ZONE 'America/Argentina/Buenos_Aires' FROM oracle_bounds;
INSERT INTO price_history(product_id,store_id,offer_url,price,stock,recorded_at)
SELECT 'contracts-index-a','mexx','https://example.invalid/another-url',1,'in-stock',now()-interval '1 day';
INSERT INTO price_history(product_id,store_id,offer_url,price,stock,recorded_at)
SELECT 'contracts-index-out','mexx','https://example.invalid/index-out',1,'in-stock',now()-interval '1 day';
INSERT INTO price_history(product_id,store_id,offer_url,price,stock,recorded_at)
SELECT 'contracts-index-a','mexx','https://example.invalid/index-a',1,'in-stock',
 (today+1+time '12:00') AT TIME ZONE 'America/Argentina/Buenos_Aires' FROM oracle_bounds;
CREATE TEMP TABLE oracle_expected(day date,category text,median_price_ars numeric,product_count bigint,offer_count bigint);
INSERT INTO oracle_expected SELECT today-offset_day,'procesadores',
 CASE WHEN offset_day>=4 THEN 150 WHEN offset_day=3 THEN 140 WHEN offset_day=2 THEN 200 ELSE 135 END,
 CASE WHEN offset_day=2 THEN 1 ELSE 2 END,CASE WHEN offset_day=2 THEN 1 ELSE 2 END
 FROM oracle_bounds CROSS JOIN generate_series(0,7) offset_day;
DO $$ BEGIN
 ASSERT NOT EXISTS ((SELECT * FROM hardware_price_index(7) WHERE category='procesadores' EXCEPT SELECT * FROM oracle_expected)
  UNION ALL (SELECT * FROM oracle_expected EXCEPT SELECT * FROM hardware_price_index(7) WHERE category='procesadores')),
  'CONTRACT_CARRY_FORWARD_NUMERIC';
 ASSERT (SELECT count(*) FROM hardware_price_index(7) WHERE category='procesadores')=8,'CONTRACT_CARRY_FORWARD_DAYS';
END $$;
ROLLBACK;
`;

const installmentsOracle = `
BEGIN;
DO $$ DECLARE at timestamptz:=now(); token uuid:=gen_random_uuid(); offer uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 evidence jsonb:='{"title":"Producto de prueba","listingRef":"mexx:url:https://example.com/fixture"}'; BEGIN
 PERFORM persist_catalog_offers(jsonb_build_array(jsonb_build_object('product_id','contracts-adaptive','store_id','mexx',
 'url','https://example.com/fixture','price',100,'stock','unknown','last_updated',at,'state_signature','first',
 'installment_count',3,'installment_amount',40)));
 ASSERT (SELECT count(*) FROM price_history)=1;
 PERFORM persist_catalog_offers(jsonb_build_array(jsonb_build_object('product_id','contracts-adaptive','store_id','mexx',
 'url','https://example.com/fixture','price',100,'stock','unknown','last_updated',at,'state_signature','second',
 'installment_count',6,'installment_amount',20)));
 ASSERT (SELECT count(*) FROM price_history)=2,'CONTRACT_GENERAL_INSTALLMENT_HISTORY';
 UPDATE catalog_offer_refresh_state SET lease_token=token,leased_until=now()+interval '10 minutes' WHERE offer_id=offer;
 ASSERT persist_adaptive_offer(offer,token,100,null,'unknown',12,10,at,at+interval '1 second',null,'third',evidence,'unspecified');
 ASSERT (SELECT count(*) FROM price_history)=2,'CONTRACT_ADAPTIVE_INSTALLMENT_HISTORY';
 ASSERT (SELECT installment_count=12 AND installment_amount=10 FROM product_prices WHERE id=offer);
 ASSERT persist_adaptive_offer(offer,token,100,null,'unknown',12,10,at,at+interval '1 second',null,'third',evidence,'unspecified');
 ASSERT (SELECT count(*) FROM price_history)=2,'CONTRACT_ADAPTIVE_RETRY_HISTORY';
END $$;
ROLLBACK;
`;

const schemaSql = `SELECT jsonb_build_object(
 'columns',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'column',a.attname,'type',format_type(a.atttypid,a.atttypmod),
 'notNull',a.attnotnull,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY c.relname,a.attnum)
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
 LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname IN ('public','auth') AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped),
 'indexes',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',i.relname,'definition',pg_get_indexdef(x.indexrelid),
 'valid',x.indisvalid,'ready',x.indisready) ORDER BY c.relname,i.relname) FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid
 JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth')),
 'constraints',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',x.conname,'definition',pg_get_constraintdef(x.oid)) ORDER BY c.relname,x.conname)
 FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth')),
 'triggers',(SELECT jsonb_agg(pg_get_triggerdef(t.oid) ORDER BY c.relname,t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth') AND NOT t.tgisinternal),
 'functions',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'acl',p.proacl::text)
 ORDER BY p.oid::regprocedure::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','auth') AND p.prokind='f'),
 'rls',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'enabled',c.relrowsecurity,'forced',c.relforcerowsecurity,'acl',c.relacl::text)
 ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth') AND c.relkind='r'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.schemaname,p.tablename,p.policyname) FROM pg_policies p WHERE schemaname IN ('public','auth'))
 );`;

export async function runContracts(file) {
  const output = await validateOutput(file);
  const handle = await fs.open(output, 'wx', 0o600);
  let local, started = false, receipt, stage = 'initialization';
  const startedAt = new Date().toISOString();
  const run = (binary,args,sql) => {
    try { return execFileSync(pg+binary,args,{input:sql,encoding:'utf8',env:childEnv,stdio:['pipe','pipe','pipe'],timeout:60000,maxBuffer:8*1024*1024}); }
    catch (error) {
      const failure = new Error('CONTRACT_LOCAL_PROCESS_FAILED');
      failure.diagnostic=String(error.stderr??error.message).slice(0,6000); throw failure;
    }
  };
  try {
    local = await fs.mkdtemp('/tmp/comparador-contracts-');
    await fs.chmod(local,0o700);
    const data=path.join(local,'data'),socket=path.join(local,'socket');
    await fs.mkdir(socket,{mode:0o700});
    run('initdb',['-D',data,'-U','postgres','-A','trust','--no-locale','--encoding=UTF8']);
    // Una respuesta incierta al arranque también debe comprobar y limpiar sólo este directorio propio.
    started=true;
    run('pg_ctl',['-D',data,'-l',path.join(local,'postgres.log'),'-o',`-h '' -k ${socket} -p 55489 -c cluster_name=contracts-local`,'-w','start']);
    run('createdb',['-h',socket,'-p','55489','-U','postgres','catalog_contracts_local']);
    const connection=['-X','-h',socket,'-p','55489','-U','postgres','-d','catalog_contracts_local','-v','ON_ERROR_STOP=1','-Atq'];
    const query=sql=>run('psql',connection,sql).trim();
    assert.equal(query('SHOW data_directory;'),data,'CONTRACT_CLUSTER_DIRECTORY');
    assert.equal(query('SHOW listen_addresses;'),'','CONTRACT_NO_TCP');
    assert.equal(query('SHOW cluster_name;'),'contracts-local','CONTRACT_CLUSTER_IDENTITY');
    const version=query('SHOW server_version;'); assert.match(version,/^17\./,'CONTRACT_PG_VERSION');
    stage='bootstrap';
    const bootstrap=await fs.readFile(path.join(root,'supabase/tests/bootstrap-local.sql'),'utf8');
    query(bootstrap);
    query('ALTER ROLE service_role BYPASSRLS;');
    const migrations=selectMigrations(await fs.readdir(path.join(root,'supabase/migrations'))),sources=[{path:'supabase/tests/bootstrap-local.sql',sha256:sha(bootstrap)}];
    for(const name of migrations) {
      stage=name; const sql=await fs.readFile(path.join(root,'supabase/migrations',name),'utf8');
      query(sql);sources.push({path:'supabase/migrations/'+name,sha256:sha(sql)});
    }
    // Referencia SQL vigente anterior al fastpath, sólo como función de comparación local.
    const activation=await fs.readFile(path.join(root,'supabase/migrations/20261002155711_activate_current_catalog_reads.sql'),'utf8');
    const start=activation.indexOf('create or replace function public.search_catalog_page('),end=activation.indexOf('\n\ncommit;',start);
    assert.ok(start>=0&&end>start,'CONTRACT_BASELINE_FUNCTION');
    query(activation.slice(start,end).replace('public.search_catalog_page(','public.search_catalog_page_baseline('));
    stage='synthetic-fixture';query(baselineFixture);
    const tableNames=JSON.parse(query(`SELECT jsonb_agg(n.nspname||'.'||c.relname ORDER BY n.nspname,c.relname) FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth') AND c.relkind='r';`));
    const dataHashes=()=>Object.fromEntries(tableNames.map(table=>[table,sha(query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM ${table} t;`))]));
    const schemaHash=()=>sha(query(schemaSql));
    const originalData=dataHashes(),originalSchema=schemaHash();
    const suites=[];
    for(const name of suiteNames) {
      const sql=await fs.readFile(path.join(root,'supabase/tests',name),'utf8');
      suites.push({name,sql});sources.push({path:'supabase/tests/'+name,sha256:sha(sql)});
    }
    const phases=[];
    const verify=label=>{
      const checks=[];
      for(const suite of suites) {stage=label+'/'+suite.name;query(suite.sql);checks.push({name:suite.name,passed:true});}
      stage=label+'/carry-forward';query(carryForwardOracle);checks.push({name:'carry-forward-numeric-eight-days',passed:true});
      stage=label+'/installments';query(installmentsOracle);checks.push({name:'writer-installment-difference-and-retry',passed:true});
      assert.deepEqual(dataHashes(),originalData,'CONTRACT_SOURCE_DATA_CHANGED');
      assert.equal(schemaHash(),originalSchema,'CONTRACT_SCHEMA_CHANGED');
      phases.push({name:label,checks,exactDataPreserved:true,schemaSha256:originalSchema});
    };
    verify('before-compaction');
    const compacted=[];
    for(const table of ['products','product_prices','price_history','catalog_price_summaries']) {
      stage='compact/'+table;
      const before=Number(query(`SELECT pg_total_relation_size('public.${table}');`));
      const at=performance.now();query(`VACUUM (FULL, ANALYZE) public.${table};`);
      compacted.push({table,beforeBytes:before,afterBytes:Number(query(`SELECT pg_total_relation_size('public.${table}');`)),wallMs:Math.round(performance.now()-at)});
      assert.deepEqual(dataHashes(),originalData,'CONTRACT_COMPACTION_DATA_CHANGED');
      assert.equal(schemaHash(),originalSchema,'CONTRACT_COMPACTION_SCHEMA_CHANGED');
    }
    verify('after-compaction');
    sources.push({path:'scripts/pilots/catalog-restructure-contracts.mjs',sha256:sha(await fs.readFile(import.meta.filename))});
    receipt={success:true,localOnly:true,noTcp:true,syntheticOnly:true,projectEnvironmentRead:false,
      restorationViaObservationRpc:false,observationTestsOnlyOwnCluster:true,startedAt,postgresVersion:version,
      migrationCount:migrations.length,sources,phases,compacted,dataHashes:originalData,schemaSha256:originalSchema,
      checksPassed:phases.reduce((sum,p)=>sum+p.checks.length,0),
      limits:['Synthetic fixtures are not production availability or a backup of the real catalog.',
        'No remote definitions/permissions are compared; replay uses repository migrations and synthetic Auth roles.',
        'OAuth, public URL runtime, 3-hour application guide rules and actual sessions are not exercised.',
        'Table sizes/duration on small fixtures do not prove production savings, downtime, WAL or transient capacity.',
        'This tests compaction continuity, not selective deletion, shadow-table cutover or a migration restore.',
        'Service-role BYPASSRLS/grants and auth.users are local synthetic bootstrap, not a production security change.']};
  } catch(error) { receipt={success:false,localOnly:true,noTcp:true,syntheticOnly:true,stage,
    reason:error.message,diagnostic:error.diagnostic??null,startedAt};throw error; }
  finally {
    let clusterStopped=!started;
    if(started) {
      try {
        let running=true;
        try {execFileSync(pg+'pg_ctl',['-D',path.join(local,'data'),'status'],{env:childEnv,stdio:['ignore','pipe','pipe'],timeout:10000});}
        catch(error) {if(error.status===3) running=false;else throw error;}
        if(running) run('pg_ctl',['-D',path.join(local,'data'),'-m','fast','-w','stop']);
        clusterStopped=true;
      } catch {clusterStopped=false;if(receipt){receipt.success=false;receipt.cleanupError='CONTRACT_OWN_CLUSTER_STOP_FAILED';}}
    }
    if(local&&clusterStopped) await fs.rm(local,{recursive:true,force:true});
    if(receipt) {receipt.clusterStopped=clusterStopped;receipt.temporaryRemoved=Boolean(local&&clusterStopped);receipt.completedAt=new Date().toISOString();
      await handle.writeFile(JSON.stringify(receipt,null,2)+'\n');}
    await handle.close();
  }
  assert.equal(receipt.success,true,'CONTRACT_LAB_OR_CLEANUP_FAILED');
  return receipt;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  assert.equal(process.argv.length,3,'CONTRACT_ARGUMENTS');
  runContracts(process.argv[2]).then(receipt=>console.log(JSON.stringify({success:true,localOnly:true,checksPassed:receipt.checksPassed,
    migrationCount:receipt.migrationCount,output:process.argv[2]}))).catch(()=>{console.error('CONTRACT_LAB_FAILED; inspect private receipt');process.exitCode=1;});
}
