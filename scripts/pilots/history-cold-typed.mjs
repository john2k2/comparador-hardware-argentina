// Candidata de laboratorio: SQL y fixtures locales; no es un backend frío productivo.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '../..');
const rpcFile = 'supabase/migrations/20260902040126_hardware_price_index_rpc_fast_plpgsql_fix.sql';
const liveDefinitionMd5 = '690e0fd5f366627d274ab78416463312'; // Inventario de coordinación, 08/10 20:56 UTC.
const pg = '/opt/homebrew/opt/postgresql@17/bin/';
const childEnv = { PATH: '/opt/homebrew/bin:/usr/bin:/bin', LC_ALL: 'C' };
const sha = value => createHash('sha256').update(value).digest('hex');
const literal = value => "'" + value.replaceAll("'", "''") + "'";
const uuid = i => `10000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`;
const historyColumns = `id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL REFERENCES public.products(id) ON UPDATE CASCADE ON DELETE CASCADE,
  store_id text NOT NULL REFERENCES public.stores(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  price numeric(14,2) NOT NULL CHECK(price>=0),original_price numeric(14,2),
  stock text NOT NULL DEFAULT 'unknown' CHECK(stock IN('in-stock','low-stock','out-of-stock','unknown')),
  recorded_at timestamptz NOT NULL DEFAULT now(),offer_url text`;
const ddl = `CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
  CREATE TABLE public.products(id text PRIMARY KEY,category text NOT NULL);
  CREATE TABLE public.stores(id text PRIMARY KEY);
  CREATE TABLE public.product_prices(product_id text REFERENCES public.products(id) ON UPDATE CASCADE ON DELETE CASCADE,
    store_id text REFERENCES public.stores(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    url text NOT NULL,price numeric(14,2) NOT NULL,stock text NOT NULL,UNIQUE(product_id,store_id,url));
  CREATE TABLE public.price_history(${historyColumns});
  CREATE INDEX history_product_time ON public.price_history(product_id,recorded_at DESC);
  CREATE INDEX history_store_time ON public.price_history(store_id,recorded_at DESC);
  CREATE INDEX history_time ON public.price_history(recorded_at DESC);
  CREATE INDEX history_product_store_time ON public.price_history(product_id,store_id,recorded_at DESC);
  CREATE INDEX history_offer ON public.price_history(product_id,store_id,offer_url,recorded_at DESC);
  CREATE TABLE public.price_history_reference(${historyColumns});
  CREATE INDEX reference_offer ON public.price_history_reference(product_id,store_id,offer_url,recorded_at DESC);
  CREATE TABLE public.price_history_cold(${historyColumns});
  CREATE INDEX cold_offer ON public.price_history_cold(product_id,store_id,offer_url,recorded_at DESC);
  CREATE VIEW public.price_history_all WITH(security_invoker=true) AS
    SELECT * FROM public.price_history UNION ALL SELECT * FROM public.price_history_cold;
  CREATE VIEW public.price_history_without_anchor WITH(security_invoker=true) AS
    SELECT * FROM public.price_history_all WHERE recorded_at>=
      ((timezone('America/Argentina/Buenos_Aires',now())::date-365)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires');
  CREATE VIEW public.price_history_utc_daily WITH(security_invoker=true) AS
    SELECT DISTINCT ON(product_id,store_id,offer_url,(recorded_at AT TIME ZONE 'UTC')::date) * FROM public.price_history_all
    ORDER BY product_id,store_id,offer_url,(recorded_at AT TIME ZONE 'UTC')::date,recorded_at DESC,id DESC;`;

function fixtures() {
  const products = [['cpu-a','procesadores'],['cpu-b','procesadores'],['cpu-reactivate','procesadores'],
    ['gpu-a','tarjetas-graficas'],['ram-a','memoria-ram'],['disk-a','almacenamiento']];
  const offers = products.map(([id]) => ({ product_id: id, store_id: 'store-a', url: `https://example.invalid/${id}`,
    price: id==='ram-a'?'999999999999.99':'100.00',stock:id==='cpu-reactivate'?'out-of-stock':'in-stock' }));
  offers.push({ product_id:'disk-a',store_id:'store-b',url:'https://example.invalid/disk-b',price:'25000.00',stock:'low-stock' });
  const quotes=[];
  const add=(product,url,ago,price,stock='in-stock',clock='12:00:00.123456',zone='America/Argentina/Buenos_Aires',store='store-a',original=null)=>
    quotes.push({id:uuid(quotes.length+1),product_id:product,store_id:store,offer_url:url,ago,clock,zone,price,stock,original_price:original});
  const url = id => `https://example.invalid/${id}`;
  add('cpu-a',url('cpu-a'),400,'90.00');add('cpu-a',url('cpu-a'),20,'90.00');add('cpu-a',url('cpu-a'),20,'100.00');
  add('cpu-a',url('cpu-a'),3,'80.00');add('cpu-a',url('cpu-a'),1,'80.00','out-of-stock','02:30:00.000001','UTC');
  add('cpu-a',url('cpu-a'),1,'70.00');add('cpu-a',url('cpu-a'),-1,'1.00');
  add('cpu-a','https://example.invalid/another',400,'40.00');add('cpu-a',null,400,'0.01');add('cpu-a','',400,'33.00');
  add('cpu-b',url('cpu-b'),400,'200.00','low-stock');add('cpu-reactivate',url('cpu-reactivate'),500,'300.00');
  add('gpu-a',url('gpu-a'),400,'400.00');
  add('gpu-a',url('gpu-a'),110,'300.00','in-stock','00:30:00.123456','UTC');
  add('gpu-a',url('gpu-a'),110,'250.00','in-stock','05:00:00.654321','UTC');
  add('gpu-a',url('gpu-a'),100,'250.00','unknown');add('gpu-a',url('gpu-a'),95,'250.00','out-of-stock');
  add('gpu-a',url('gpu-a'),90,'225.00');
  add('ram-a',url('ram-a'),400,'999999999999.99','in-stock','12:00:00.000001','America/Argentina/Buenos_Aires','store-a','-999999999999.99');
  add('disk-a',url('disk-a'),400,'50000.00');
  add('disk-a','https://example.invalid/disk-b',400,'25000.00','low-stock','12:00:00.123456','America/Argentina/Buenos_Aires','store-b');
  add('disk-a','https://example.invalid/disk-b',10,'0.00','in-stock','12:00:00.123456','America/Argentina/Buenos_Aires','store-b');
  add('disk-a','https://example.invalid/disk-b',3,'25000.00','low-stock','12:00:00.123456','America/Argentina/Buenos_Aires','store-b');
  // Datos sintéticos de volumen excluidos inicialmente de las cuatro categorías de la RPC.
  for(let p=0;p<24;p++) {
    const id=`bulk-${p}`;products.push([id,'perifericos']);
    offers.push({product_id:id,store_id:'store-a',url:url(id),price:'123456.78',stock:'in-stock'});
    for(let ago=0;ago<=420;ago+=7) add(id,url(id),ago,`${123000+p}.78`,'in-stock','12:00:00.123456',
      'America/Argentina/Buenos_Aires','store-a',p%2===0?'-0.01':null);
  }
  return {products,offers,quotes};
}

const variants = [
  ['reference','price_history_reference'],['candidate','price_history_all'],
  ['no_anchor','price_history_without_anchor'],['utc_daily','price_history_utc_daily'],
];
const transform = (sql,name,relation) => {
  assert.equal(sql.split('join public.price_history ph').length,2,'TYPED_RPC_SINGLE_READ');
  return sql.replaceAll('public.hardware_price_index(',`public.hardware_price_index_${name}(`)
    .replace('join public.price_history ph',`join public.${relation} ph`);
};
const differenceSql = (a,b) => `SELECT jsonb_build_object('leftOnly',(SELECT count(*) FROM (SELECT * FROM ${a} EXCEPT ALL SELECT * FROM ${b}) t),
  'rightOnly',(SELECT count(*) FROM (SELECT * FROM ${b} EXCEPT ALL SELECT * FROM ${a}) t),
  'leftRows',(SELECT count(*) FROM ${a}),'rightRows',(SELECT count(*) FROM ${b}));`;
const cases = [
  ['stock-out',"UPDATE product_prices SET stock='out-of-stock' WHERE product_id='cpu-a'"],
  ['stock-unknown',"UPDATE product_prices SET stock='unknown' WHERE product_id='cpu-a'"],
  ['current-price-zero',"UPDATE product_prices SET price=0 WHERE product_id='cpu-a'"],
  ['current-category-change',"UPDATE products SET category='tarjetas-graficas' WHERE id='cpu-a'"],
  ['current-category-excluded',"UPDATE products SET category='perifericos' WHERE id='cpu-a'"],
  ['current-url-change',"UPDATE product_prices SET url='https://example.invalid/another' WHERE product_id='cpu-a'"],
  ['current-url-empty',"UPDATE product_prices SET url='' WHERE product_id='cpu-a'"],
  ['current-url-without-history',"UPDATE product_prices SET url='https://example.invalid/missing' WHERE product_id='cpu-a'"],
  ['reactivation-with-old-anchor',"UPDATE product_prices SET stock='low-stock' WHERE product_id='cpu-reactivate'"],
  ['promote-category',"UPDATE products SET category='memoria-ram' WHERE id='bulk-0'"],
  ['remove-current-offer',"DELETE FROM product_prices WHERE product_id='cpu-a'"],
];

export async function runHistoryColdTypedLab() {
  const startedAt=new Date().toISOString(),start=performance.now(),cpuStart=process.cpuUsage();
  const sourceSql=await fs.readFile(path.join(root,rpcFile),'utf8'),fixture=fixtures();
  const parent=path.join(root,'tmp/drenaje-telemetria-2026-10-08');await fs.mkdir(parent,{recursive:true,mode:0o700});
  assert.equal(await fs.realpath(parent),parent,'TYPED_OUTPUT_PARENT');
  const output=await fs.mkdtemp(path.join(parent,'cold-typed-'));await fs.chmod(output,0o700);
  let local,mayBeRunning=false,receipt,stage='start';
  const run=(bin,args,sql)=>{
    try{return execFileSync(pg+bin,args,{input:sql,env:childEnv,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:60000,maxBuffer:8*1024**2});}
    catch(error){const fail=new Error('TYPED_LOCAL_PROCESS_FAILED');fail.diagnostic=String(error.stderr??error.message).slice(0,2000);throw fail;}
  };
  try {
    local=await fs.mkdtemp('/tmp/comparador-typed-');await fs.chmod(local,0o700);
    const data=path.join(local,'data'),socket=path.join(local,'s');await fs.mkdir(socket,{mode:0o700});
    run('initdb',['-D',data,'-U','postgres','-A','trust','--no-locale','--encoding=UTF8']);mayBeRunning=true;
    run('pg_ctl',['-D',data,'-l',path.join(local,'postgres.log'),'-o',`-h '' -k ${socket} -p 55493 -c cluster_name=history-cold-typed-local`,'-w','start']);
    run('createdb',['-h',socket,'-p','55493','-U','postgres','typed_local']);
    const connection=['-X','-h',socket,'-p','55493','-U','postgres','-d','typed_local','-v','ON_ERROR_STOP=1','-Atq'];
    const query=sql=>run('psql',connection,`SET statement_timeout='30s';SET TIME ZONE 'UTC';${sql}`).trim();
    assert.equal(query('SHOW data_directory;'),data,'TYPED_CLUSTER_DIRECTORY');assert.equal(query('SHOW listen_addresses;'),'','TYPED_NO_TCP');
    assert.equal(query('SHOW cluster_name;'),'history-cold-typed-local','TYPED_CLUSTER_IDENTITY');
    const version=query('SHOW server_version;');assert.match(version,/^17\./);
    const day=query("SELECT timezone('America/Argentina/Buenos_Aires',now())::date;");
    const cutoff=query("SELECT to_char(now()-interval '90 days','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"');");
    stage='oracle-definition';query(ddl);query(sourceSql);
    const localDefinition=query("SELECT pg_get_functiondef('public.hardware_price_index(integer)'::regprocedure);");
    const localMd5=query("SELECT md5(pg_get_functiondef('public.hardware_price_index(integer)'::regprocedure));");
    assert.equal(localMd5,liveDefinitionMd5,'TYPED_LIVE_DEFINITION_MISMATCH');
    for(const [name,relation] of variants) query(transform(sourceSql,name,relation));
    stage='fixture';query(`INSERT INTO stores VALUES('store-a'),('store-b');
      INSERT INTO products SELECT product_id,category FROM jsonb_to_recordset(${literal(JSON.stringify(fixture.products.map(([product_id,category])=>({product_id,category}))))}::jsonb) AS t(product_id text,category text);
      INSERT INTO product_prices SELECT * FROM jsonb_to_recordset(${literal(JSON.stringify(fixture.offers))}::jsonb)
        AS t(product_id text,store_id text,url text,price numeric(14,2),stock text);
      INSERT INTO price_history(id,product_id,store_id,offer_url,price,original_price,stock,recorded_at)
      SELECT id,product_id,store_id,offer_url,price,original_price,stock,(${literal(day)}::date-ago+clock::time) AT TIME ZONE zone
        FROM jsonb_to_recordset(${literal(JSON.stringify(fixture.quotes))}::jsonb)
          AS t(id uuid,product_id text,store_id text,offer_url text,price numeric(14,2),original_price numeric(14,2),stock text,ago integer,clock text,zone text);
      INSERT INTO price_history_reference SELECT * FROM price_history;ANALYZE price_history;ANALYZE price_history_reference;`);
    // Resultado numérico independiente: ni el helper transformado ni la unión crean estas expectativas.
    query(`CREATE TEMP TABLE expected_cpu AS SELECT ${literal(day)}::date-d AS day,'procesadores'::text AS category,
      CASE WHEN d>=4 THEN 150 WHEN d=3 THEN 140 WHEN d=2 THEN 200 ELSE 135 END::numeric AS median_price_ars,
      CASE WHEN d=2 THEN 1 ELSE 2 END::bigint AS product_count,CASE WHEN d=2 THEN 1 ELSE 2 END::bigint AS offer_count
      FROM generate_series(0,7) d;
      DO $$ BEGIN IF EXISTS((SELECT * FROM hardware_price_index(7) WHERE category='procesadores' EXCEPT ALL SELECT * FROM expected_cpu)
        UNION ALL(SELECT * FROM expected_cpu EXCEPT ALL SELECT * FROM hardware_price_index(7) WHERE category='procesadores'))
        THEN RAISE EXCEPTION 'TYPED_CPU_NUMERIC_ORACLE';END IF;
      IF EXISTS(SELECT 1 FROM hardware_price_index(7) WHERE category='almacenamiento' AND
        (product_count<>1 OR offer_count<>CASE WHEN day<${literal(day)}::date-3 THEN 1 ELSE 2 END
        OR median_price_ars<>CASE WHEN day<${literal(day)}::date-3 THEN 50000 ELSE 25000 END))
        THEN RAISE EXCEPTION 'TYPED_MIN_PER_PRODUCT';END IF;
      IF (SELECT count(*) FROM hardware_price_index(7) WHERE category='almacenamiento')<>8
        THEN RAISE EXCEPTION 'TYPED_STORAGE_ORACLE_NONEMPTY';END IF;END $$;
      CREATE TABLE baseline_index AS SELECT 7 AS horizon,* FROM hardware_price_index_reference(7)
        UNION ALL SELECT 90,* FROM hardware_price_index_reference(90) UNION ALL SELECT 365,* FROM hardware_price_index_reference(365);`);
    const parity=[];
    const compare=(label,mutation='')=>{
      for(const days of [7,90,365]) {
        const baseline=`(SELECT day,category,median_price_ars,product_count,offer_count FROM baseline_index WHERE horizon=${days})`;
        const records=query(`BEGIN;${mutation};${differenceSql(`hardware_price_index_reference(${days})`,`hardware_price_index_candidate(${days})`)}
          ${mutation?differenceSql(baseline,`hardware_price_index_reference(${days})`):''}ROLLBACK;`).split('\n').map(JSON.parse);
        const [result,cohortDifference]=records;
        assert.equal(result.leftOnly+result.rightOnly,0,'TYPED_RPC_PARITY');assert.equal(result.leftRows,result.rightRows);
        assert.ok(result.leftRows>0,'TYPED_RPC_NONEMPTY');
        if(mutation)assert.ok(cohortDifference.leftOnly+cohortDifference.rightOnly>0,'TYPED_COHORT_MUTATION_INEFFECTIVE');
        parity.push({label,days,...result,cohortDifference:cohortDifference??null});
      }
    };
    const size=table=>JSON.parse(query(`SELECT jsonb_build_object('rows',(SELECT count(*) FROM ${table}),
      'heapBytes',pg_relation_size('${table}'),'tableBytes',pg_table_size('${table}'),'indexBytes',pg_indexes_size('${table}'),
      'totalBytes',pg_total_relation_size('${table}'),'toastBytes',coalesce((SELECT pg_total_relation_size(reltoastrelid)
        FROM pg_class WHERE oid='${table}'::regclass AND reltoastrelid<>0),0),
      'indexes',(SELECT jsonb_agg(jsonb_build_object('definition',pg_get_indexdef(indexrelid),'bytes',pg_relation_size(indexrelid)))
        FROM pg_index WHERE indrelid='${table}'::regclass));`));
    const originalBeforeCompact=size('price_history');query('VACUUM(FULL,ANALYZE) price_history;');
    const original=size('price_history');compare('before-split');
    const hotIdentity=query("SELECT 'price_history'::regclass::oid;");
    stage='split-local';query(`BEGIN;INSERT INTO price_history_cold SELECT * FROM price_history WHERE recorded_at<${literal(cutoff)}::timestamptz;
      DELETE FROM price_history h USING price_history_cold c WHERE h.id=c.id;COMMIT;ANALYZE price_history;ANALYZE price_history_cold;`);
    assert.equal(query("SELECT 'price_history'::regclass::oid;"),hotIdentity,'TYPED_HOT_IDENTITY_CHANGED');
    const exactRows=JSON.parse(query(differenceSql('price_history_reference','price_history_all')));
    assert.equal(exactRows.leftOnly+exactRows.rightOnly,0,'TYPED_EIGHT_FIELDS');
    assert.equal(Number(query('SELECT count(*)-count(DISTINCT id) FROM price_history_all;')),0,'TYPED_DUPLICATED_IDS');
    const globalUuidCollisionProbe=Number(query(`BEGIN;INSERT INTO price_history SELECT * FROM price_history_cold ORDER BY id LIMIT 1;
      SELECT count(*)-count(DISTINCT id) FROM price_history_all;ROLLBACK;`));
    assert.equal(globalUuidCollisionProbe,1,'TYPED_GLOBAL_UUID_GATE_NOT_EXPOSED');
    const home24h=JSON.parse(query(differenceSql("(SELECT product_id,store_id,offer_url,price,recorded_at FROM price_history_reference WHERE recorded_at>=now()-interval '24 hours' ORDER BY recorded_at DESC LIMIT 5000)",
      "(SELECT product_id,store_id,offer_url,price,recorded_at FROM price_history WHERE recorded_at>=now()-interval '24 hours' ORDER BY recorded_at DESC LIMIT 5000)")));
    assert.equal(home24h.leftOnly+home24h.rightOnly,0,'TYPED_HOME_24H');
    compare('after-split');for(const [name,mutation] of cases) {stage=name;compare(name,mutation);}
    const negative=[];
    for(const [name,relation] of [['hot-only','hardware_price_index'],['anchor-removed','hardware_price_index_no_anchor'],['utc-daily','hardware_price_index_utc_daily']]) {
      const result=JSON.parse(query(differenceSql('hardware_price_index_reference(365)',`${relation}(365)`)));
      assert.ok(result.leftOnly+result.rightOnly>0,'TYPED_NEGATIVE_CONTROL_INSENSITIVE');negative.push({name,days:365,...result});
    }
    stage='physical';const afterLogical={hot:size('price_history'),cold:size('price_history_cold')};
    for(const table of ['price_history','price_history_cold']) query(`VACUUM(FULL,ANALYZE) ${table};`);
    const afterCompact={hot:size('price_history'),cold:size('price_history_cold')};compare('after-local-compaction');
    const benchmarks=[];
    for(const days of [7,90,365]) for(const fn of ['reference','candidate']) {
      const plans=Array.from({length:3},()=>JSON.parse(query(`EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) SELECT * FROM hardware_price_index_${fn}(${days});`))[0]);
      benchmarks.push({function:fn,days,repetitions:3,executionMs:plans.map(p=>p['Execution Time']),firstPlan:plans[0],lastPlan:plans[2]});
    }
    stage='fk-and-restore';query(`BEGIN;UPDATE products SET id='cpu-a-renamed' WHERE id='cpu-a';UPDATE stores SET id='store-a-renamed' WHERE id='store-a';
      DO $$ BEGIN IF EXISTS((SELECT * FROM price_history_reference EXCEPT ALL SELECT * FROM price_history_all)
        UNION ALL(SELECT * FROM price_history_all EXCEPT ALL SELECT * FROM price_history_reference)) THEN RAISE EXCEPTION 'TYPED_FK_UPDATE';END IF;END $$;ROLLBACK;
      DO $$ BEGIN BEGIN DELETE FROM stores WHERE id='store-a';RAISE EXCEPTION 'TYPED_STORE_DELETE_ACCEPTED';EXCEPTION WHEN foreign_key_violation THEN NULL;END;END $$;
      BEGIN;DELETE FROM product_prices WHERE product_id='cpu-a';DELETE FROM products WHERE id='cpu-a';
      DO $$ BEGIN IF EXISTS(SELECT 1 FROM price_history_all WHERE product_id='cpu-a') THEN RAISE EXCEPTION 'TYPED_PRODUCT_CASCADE';END IF;END $$;ROLLBACK;`);
    query(`CREATE TABLE restored(${historyColumns});BEGIN;INSERT INTO restored SELECT * FROM price_history_all;
      INSERT INTO restored SELECT * FROM price_history_all ON CONFLICT(id) DO NOTHING;COMMIT;`);
    const restored=JSON.parse(query(differenceSql('price_history_reference','restored')));assert.equal(restored.leftOnly+restored.rightOnly,0,'TYPED_RESTORE');
    assert.equal(query("SELECT timezone('America/Argentina/Buenos_Aires',now())::date;"),day,'TYPED_DAY_CHANGED');
    receipt={success:true,startedAt,postgresVersion:version,localOnly:true,noTcp:true,remoteQueries:0,productionWrites:0,
      source:{path:rpcFile,sha256:sha(sourceSql),localDefinitionMd5:localMd5,coordinatorLiveDefinitionMd5:liveDefinitionMd5,
        liveMetadataCut:'2026-10-08T20:56:00Z; informada por coordinación',exactDefinitionMatches:true,definitionSha256:sha(localDefinition)},
      fixture:{sha256:sha(JSON.stringify(fixture)),quoteRows:fixture.quotes.length,productRows:fixture.products.length,
        independentTextDecimalsAndMicroseconds:true,syntheticOnly:true,dayBuenosAires:day,cutoffExclusive:cutoff},
      invariants:{physicalHotIdentityPreserved:true,eightFields:exactRows,distinctIdsInObservedUnion:true,home24h,
        independentCpuSevenDayNumericOracle:true,minPerProductAndOfferCounts:true,parentUpdatesCascade:true,
        storeDeletionRestricted:true,productDeletionCascades:true,idempotentRestore:restored},parity,negative,
      sizes:{originalBeforeCompact,original,afterLogical,afterCompact,globalIdRegistryImplemented:false},benchmarks,
      globalUuidCollisionProbe:{duplicateAcceptedAcrossTables:true,observedDuplicateRows:globalUuidCollisionProbe,rolledBack:true},
      limits:['Exact local RPC definition matches coordinator live hash; no new live query or remote runtime proof.',
        'Synthetic catalog parents and PostgreSQL superuser execution do not validate production RLS/grants/auth.',
        'One exact eight-field UNION ALL split is demonstrated; ongoing global hot/cold UUID enforcement is not implemented.',
        'Full app writer/trigger/lease behavior, remote capacity, WAL, concurrent movement and rollback peak are not validated.',
        'Cold keeps all old observations, including anchors older than365 days; retention policy was not executed.',
        'Three serial local SQL timings are not network/user latency or isolated PostgreSQL CPU/memory.',
        'Fresh synthetic relation sizes and local VACUUM FULL are not a forecast of production saving or maintenance permission.'],
      scriptSha256:sha(await fs.readFile(import.meta.filename))};
  } catch(error){receipt={success:false,localOnly:true,startedAt,stage,reason:error.message,diagnostic:error.diagnostic??null};}
  finally {
    let clusterStopped=!mayBeRunning;
    if(mayBeRunning) try {
      let running=true;try{execFileSync(pg+'pg_ctl',['-D',path.join(local,'data'),'status'],{env:childEnv,stdio:['ignore','pipe','pipe'],timeout:10000});}
      catch(error){if(error.status===3)running=false;else throw error;}
      if(running)run('pg_ctl',['-D',path.join(local,'data'),'-m','fast','-w','stop']);clusterStopped=true;
    } catch{clusterStopped=false;receipt.success=false;receipt.cleanupError='TYPED_OWN_CLUSTER_STOP_FAILED';}
    if(local&&clusterStopped)await fs.rm(local,{recursive:true,force:true});
    receipt.clusterStopped=clusterStopped;receipt.clusterDirectoryRemoved=Boolean(local&&clusterStopped);
    receipt.completedAt=new Date().toISOString();receipt.wallMs=Math.round(performance.now()-start);
    receipt.nodeCpuMicros=process.cpuUsage(cpuStart);receipt.nodeMemoryAfterLab=process.memoryUsage();
    await fs.writeFile(path.join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
  }
  assert.equal(receipt.success,true,'TYPED_LAB_OR_CLEANUP_FAILED');
  return {output:path.relative(root,output),success:true,definitionMatchesLive:true,parityCases:receipt.parity.length,
    negativeControls:receipt.negative.length,sizes:receipt.sizes,clusterStopped:receipt.clusterStopped};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  runHistoryColdTypedLab().then(result=>process.stdout.write(JSON.stringify(result,null,2)+'\n'))
    .catch(error=>{process.stderr.write(`${error.message}\n`);process.exitCode=1;});
}
