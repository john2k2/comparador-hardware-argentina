// Laboratorio privado; no migra ni publica. La fixture reutilizada permanece inmutable.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const root=path.resolve(import.meta.dirname,'../..'),pg='/opt/homebrew/opt/postgresql@17/bin/';
const env={PATH:'/opt/homebrew/bin:/usr/bin:/bin',LC_ALL:'C'},sha=x=>createHash('sha256').update(x).digest('hex');
const lit=x=>"'"+x.replaceAll("'","''")+"'",uuid=i=>`10000000-0000-4000-8000-${i.toString(16).padStart(12,'0')}`;
const typedFile='scripts/pilots/history-cold-typed.mjs',typedHash='2ed84fd8716f55aa649b48003255c95bb183ff37bdb6cb76ab8bb5348398d0e1';
const rpcFile='supabase/migrations/20260902040126_hardware_price_index_rpc_fast_plpgsql_fix.sql';
const sourceFiles=['20260930120000_atomic_catalog_offers.sql','20260929161015_persist_priority_offer.sql',
  '20260927234548_track_requested_offer_observation.sql','20260930133000_catalog_price_read_model.sql',
  '20261002003210_catalog_inventory_discovery.sql','20261002151329_persist_verified_listing_observations.sql',
  '20261002143236_bind_observed_listing_identity.sql','20260824174500_catalog_integrity_and_offer_history.sql'];
const integritySql=`CREATE SCHEMA cold_lab;
 CREATE TABLE cold_lab.history_ids(id uuid PRIMARY KEY,cold boolean NOT NULL);
 INSERT INTO cold_lab.history_ids SELECT id,false FROM price_history;
 CREATE FUNCTION cold_lab.claim() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE owner boolean; BEGIN
  IF TG_OP='UPDATE' THEN IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'immutable history id' USING ERRCODE='23514';END IF;RETURN NEW;END IF;
  INSERT INTO cold_lab.history_ids VALUES(NEW.id,TG_TABLE_NAME='price_history_cold')
   ON CONFLICT(id) DO UPDATE SET cold=history_ids.cold RETURNING cold INTO owner;
  IF owner<>(TG_TABLE_NAME='price_history_cold') THEN RAISE EXCEPTION 'global history id collision' USING ERRCODE='23505';END IF;
  RETURN NEW;END $$;
 CREATE FUNCTION cold_lab.release() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  DELETE FROM cold_lab.history_ids WHERE id=OLD.id AND cold=(TG_TABLE_NAME='price_history_cold');RETURN OLD;END $$;
 CREATE FUNCTION cold_lab.verify_owner() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE owner boolean;h integer;c integer; BEGIN
  SELECT cold INTO owner FROM cold_lab.history_ids WHERE id=NEW.id;IF NOT FOUND THEN RETURN NULL;END IF;
  SELECT count(*) INTO h FROM price_history WHERE id=NEW.id;SELECT count(*) INTO c FROM price_history_cold WHERE id=NEW.id;
  IF h+c<>1 OR (owner AND c<>1) OR (NOT owner AND h<>1) THEN RAISE EXCEPTION 'registry ownership mismatch' USING ERRCODE='23514';END IF;RETURN NULL;END $$;
 CREATE CONSTRAINT TRIGGER verify_owner AFTER INSERT OR UPDATE ON cold_lab.history_ids DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION cold_lab.verify_owner();
 CREATE FUNCTION cold_lab.move(p_id uuid,p_cold boolean) RETURNS boolean LANGUAGE plpgsql AS $$
 DECLARE owner boolean;r public.price_history;BEGIN
  SELECT cold INTO owner FROM cold_lab.history_ids WHERE id=p_id FOR UPDATE;IF NOT FOUND THEN RETURN false;END IF;
  IF owner=p_cold THEN RETURN false;END IF;
  IF owner THEN SELECT * INTO STRICT r FROM price_history_cold WHERE id=p_id FOR UPDATE;
   ELSE SELECT * INTO STRICT r FROM price_history WHERE id=p_id FOR UPDATE;END IF;
  UPDATE cold_lab.history_ids SET cold=p_cold WHERE id=p_id;
  IF owner THEN DELETE FROM price_history_cold WHERE id=p_id;INSERT INTO price_history SELECT r.*;
   ELSE DELETE FROM price_history WHERE id=p_id;INSERT INTO price_history_cold SELECT r.*;END IF;RETURN true;END $$;
 CREATE FUNCTION cold_lab.restore(r public.price_history) RETURNS boolean LANGUAGE plpgsql AS $$
 DECLARE owner boolean;previous public.price_history;BEGIN
  INSERT INTO cold_lab.history_ids VALUES(r.id,r.recorded_at<now()-interval '90 days')
   ON CONFLICT(id) DO UPDATE SET cold=history_ids.cold RETURNING cold INTO owner;
  IF owner THEN SELECT * INTO previous FROM price_history_cold WHERE id=r.id FOR UPDATE;
   ELSE SELECT * INTO previous FROM price_history WHERE id=r.id FOR UPDATE;END IF;
  IF FOUND THEN IF previous IS DISTINCT FROM r THEN RAISE EXCEPTION 'restore content collision' USING ERRCODE='23505';END IF;RETURN false;END IF;
  IF owner THEN INSERT INTO price_history_cold SELECT r.*;ELSE INSERT INTO price_history SELECT r.*;END IF;RETURN true;END $$;
 REVOKE ALL ON SCHEMA cold_lab FROM PUBLIC;REVOKE ALL ON ALL FUNCTIONS IN SCHEMA cold_lab FROM PUBLIC;`;
const historyTriggers=table=>`ALTER TABLE ${table} ADD CONSTRAINT ${table}_global_id_fk FOREIGN KEY(id) REFERENCES cold_lab.history_ids(id);
 CREATE TRIGGER claim_id BEFORE INSERT OR UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION cold_lab.claim();
 CREATE TRIGGER release_id AFTER DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION cold_lab.release();`;
const funcs=sql=>[...sql.matchAll(/create(?: or replace)? function\s+[\s\S]*?\$\$;/gi)].map(m=>m[0]);
const difference=(a,b)=>`SELECT jsonb_build_object('leftOnly',(SELECT count(*) FROM(SELECT * FROM ${a} EXCEPT ALL SELECT * FROM ${b})x),
 'rightOnly',(SELECT count(*) FROM(SELECT * FROM ${b} EXCEPT ALL SELECT * FROM ${a})x));`;

export async function runHistoryColdIntegrityLab(){
 const startedAt=new Date().toISOString(),start=performance.now(),cpu=process.cpuUsage(),sources={};
 const typed=await fs.readFile(path.join(root,typedFile),'utf8');assert.equal(sha(typed),typedHash,'INTEGRITY_FIXTURE_SOURCE_CHANGED');
 // Extrae únicamente las declaraciones puras ya revisadas, nunca ejecuta su runner ni importa entorno.
 const begin=typed.indexOf('const historyColumns ='),end=typed.indexOf('const variants =');assert.ok(begin>0&&end>begin);
 const {ddl,fixture}=new Function('uuid',typed.slice(begin,end)+';return {ddl,fixture:fixtures()};')(uuid);
 for(const name of sourceFiles)sources[name]=await fs.readFile(path.join(root,'supabase/migrations',name),'utf8');
 const rpc=await fs.readFile(path.join(root,rpcFile),'utf8');
 const parent=path.join(root,'tmp/drenaje-telemetria-2026-10-08');await fs.mkdir(parent,{recursive:true,mode:0o700});
 assert.equal(await fs.realpath(parent),parent);const output=await fs.mkdtemp(path.join(parent,'cold-integrity-'));await fs.chmod(output,0o700);
 let local,running=false,receipt,stage='start';const children=new Set();
 const run=(bin,args,input)=>execFileSync(pg+bin,args,{input,env,encoding:'utf8',timeout:60000,maxBuffer:8*1024**2,stdio:['pipe','pipe','pipe']});
 try{
  local=await fs.mkdtemp('/tmp/comparador-integrity-');await fs.chmod(local,0o700);const data=path.join(local,'d'),socket=path.join(local,'s');await fs.mkdir(socket,{mode:0o700});
  run('initdb',['-D',data,'-U','postgres','-A','trust','--no-locale','--encoding=UTF8']);running=true;
  run('pg_ctl',['-D',data,'-l',path.join(local,'postgres.log'),'-o',`-h '' -k ${socket} -p 55494 -c cluster_name=history-cold-integrity-local`,'-w','start']);
  run('createdb',['-h',socket,'-p','55494','-U','postgres','integrity_local']);
  const args=['-X','-h',socket,'-p','55494','-U','postgres','-d','integrity_local','-v','ON_ERROR_STOP=1','-Atq'];
  const query=sql=>run('psql',args,`SET statement_timeout='15s';SET lock_timeout='8s';SET TIME ZONE 'UTC';${sql}`).trim();
  assert.equal(query('SHOW listen_addresses;'),'');assert.equal(query('SHOW data_directory;'),data);
  assert.equal(query('SHOW cluster_name;'),'history-cold-integrity-local');const version=query('SHOW server_version;');assert.match(version,/^17\./);
  const day=query("SELECT timezone('America/Argentina/Buenos_Aires',now())::date;"),cutoff=query("SELECT (now()-interval '90 days')::text;");
  query(ddl);query(rpc);assert.equal(query("SELECT md5(pg_get_functiondef('hardware_price_index(integer)'::regprocedure));"),'690e0fd5f366627d274ab78416463312');
  for(const [name,relation]of[['reference','price_history_reference'],['candidate','price_history_all']])query(rpc.replaceAll('public.hardware_price_index(',`public.hardware_price_index_${name}(`).replace('join public.price_history ph',`join public.${relation} ph`));
  query(`INSERT INTO stores VALUES('store-a'),('store-b');INSERT INTO products SELECT * FROM jsonb_to_recordset(${lit(JSON.stringify(fixture.products.map(([id,category])=>({id,category}))))}::jsonb)t(id text,category text);
   INSERT INTO product_prices SELECT * FROM jsonb_to_recordset(${lit(JSON.stringify(fixture.offers))}::jsonb)t(product_id text,store_id text,url text,price numeric(14,2),stock text);
   INSERT INTO price_history(id,product_id,store_id,offer_url,price,original_price,stock,recorded_at)
   SELECT id,product_id,store_id,offer_url,price,original_price,stock,(${lit(day)}::date-ago+clock::time)AT TIME ZONE zone
   FROM jsonb_to_recordset(${lit(JSON.stringify(fixture.quotes))}::jsonb)t(id uuid,product_id text,store_id text,offer_url text,price numeric(14,2),original_price numeric(14,2),stock text,ago integer,clock text,zone text);
   INSERT INTO price_history_reference SELECT * FROM price_history;`);
  const size=table=>JSON.parse(query(`SELECT jsonb_build_object('rows',(SELECT count(*)FROM ${table}),'heapBytes',pg_relation_size('${table}'),
   'tableBytes',pg_table_size('${table}'),'indexBytes',pg_indexes_size('${table}'),'totalBytes',pg_total_relation_size('${table}'),
   'indexes',(SELECT jsonb_agg(jsonb_build_object('definition',pg_get_indexdef(indexrelid),'bytes',pg_relation_size(indexrelid)))FROM pg_index WHERE indrelid='${table}'::regclass));`));
  query('VACUUM(FULL,ANALYZE) price_history;');const baseline=size('price_history'),hotOid=query("SELECT 'price_history'::regclass::oid;");
  const databaseBeforeRegistry=Number(query('SELECT pg_database_size(current_database());'));query(integritySql);for(const table of['price_history','price_history_cold'])query(historyTriggers(table));
  const installed={registry:size('cold_lab.history_ids'),databaseBytes:Number(query('SELECT pg_database_size(current_database());'))};
  const snapshotSql=`SELECT jsonb_build_object('hotBytes',pg_total_relation_size('price_history'),'coldBytes',pg_total_relation_size('price_history_cold'),
   'registryBytes',pg_total_relation_size('cold_lab.history_ids'),'totalBytes',pg_total_relation_size('price_history')+pg_total_relation_size('price_history_cold')+pg_total_relation_size('cold_lab.history_ids'),
   'walBytes',pg_wal_lsn_diff(pg_current_wal_insert_lsn(),(SELECT lsn FROM wal_start)));
  `;
  stage='atomic-split';const during=JSON.parse(query(`BEGIN;CREATE TEMP TABLE wal_start AS SELECT pg_current_wal_insert_lsn()lsn;
   DO $$DECLARE r record;BEGIN FOR r IN SELECT id FROM price_history WHERE recorded_at<${lit(cutoff)}::timestamptz ORDER BY id LOOP PERFORM cold_lab.move(r.id,true);END LOOP;END $$;
   ${snapshotSql}COMMIT;`));
  const afterCommit={hot:size('price_history'),cold:size('price_history_cold'),registry:size('cold_lab.history_ids')};
  for(const table of['price_history','price_history_cold','cold_lab.history_ids'])query(`VACUUM(FULL,ANALYZE) ${table};`);
  const compact={hot:size('price_history'),cold:size('price_history_cold'),registry:size('cold_lab.history_ids')};
  const check=()=>JSON.parse(query(`SELECT jsonb_build_object('rows',(SELECT count(*)FROM price_history_all),'registry',(SELECT count(*)FROM cold_lab.history_ids),
   'duplicates',(SELECT count(*)-count(DISTINCT id)FROM price_history_all),'orphans',(SELECT count(*)FROM cold_lab.history_ids r WHERE NOT EXISTS(SELECT 1 FROM price_history_all h WHERE h.id=r.id)),
   'wrongOwner',(SELECT count(*)FROM cold_lab.history_ids r WHERE (r.cold AND NOT EXISTS(SELECT 1 FROM price_history_cold h WHERE h.id=r.id))OR(NOT r.cold AND NOT EXISTS(SELECT 1 FROM price_history h WHERE h.id=r.id))));`));
  const assertIntegrity=()=>{const x=check();assert.equal(x.rows,x.registry);assert.equal(x.duplicates+x.orphans+x.wrongOwner,0);return x;};
  const exact=JSON.parse(query(difference('price_history_reference','price_history_all')));assert.equal(exact.leftOnly+exact.rightOnly,0);assertIntegrity();
  const parity=[];for(const d of[7,90,365]){const x=JSON.parse(query(difference(`hardware_price_index_reference(${d})`,`hardware_price_index_candidate(${d})`)));assert.equal(x.leftOnly+x.rightOnly,0);parity.push({days:d,...x});}
  const coldId=query('SELECT id FROM price_history_cold ORDER BY id LIMIT 1;'),hotId=query('SELECT id FROM price_history ORDER BY id LIMIT 1;');
  stage='duplicate-and-restore';query(`DO $$BEGIN BEGIN INSERT INTO price_history SELECT * FROM price_history_cold WHERE id=${lit(coldId)}::uuid ON CONFLICT(id)DO NOTHING;
   RAISE EXCEPTION 'cross-table collision accepted';EXCEPTION WHEN unique_violation THEN NULL;END;END $$;
   INSERT INTO price_history SELECT * FROM price_history WHERE id=${lit(hotId)}::uuid ON CONFLICT(id)DO NOTHING;
   SELECT cold_lab.restore(ROW(r.*)::price_history)FROM price_history_reference r ORDER BY id;
   SELECT cold_lab.restore(ROW(r.*)::price_history)FROM price_history_reference r ORDER BY id;
   DO $$DECLARE r price_history;BEGIN SELECT * INTO r FROM price_history_reference WHERE id=${lit(coldId)}::uuid;r.price:=r.price+1;
    BEGIN PERFORM cold_lab.restore(r);RAISE EXCEPTION 'restore mismatch accepted';EXCEPTION WHEN unique_violation THEN NULL;END;END $$;
   DO $$BEGIN BEGIN UPDATE cold_lab.history_ids SET cold=NOT cold WHERE id=${lit(coldId)}::uuid;SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'ownership bypass accepted';EXCEPTION WHEN check_violation THEN NULL;END;END $$;`);assertIntegrity();
  const actor=(name,sql)=>{const child=spawn(pg+'psql',args,{env,stdio:['pipe','pipe','pipe']});children.add(child);let out='',err='';
   child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);const promise=new Promise(resolve=>child.on('close',code=>{children.delete(child);resolve({name,code,out:out.trim(),err:err.slice(0,1500)});}));
   child.stdin.end(`SET application_name=${lit(name)};SET statement_timeout='12s';SET lock_timeout='8s';SET TIME ZONE 'UTC';${sql}`);return promise;};
  const poll=async sql=>{const end=performance.now()+5000;while(performance.now()<end){if(query(sql)==='t')return;await new Promise(r=>setTimeout(r,15));}throw new Error('INTEGRITY_CONCURRENT_BARRIER_TIMEOUT');};
  const concurrent=[];
  const pair=async(name,a,b,bCode)=>{
   const first=actor(name+'-a',`BEGIN;${a};SELECT pg_sleep(1.5);COMMIT;`);
   await poll(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=${lit(name+'-a')} AND wait_event='PgSleep');`);
   const readDuring=JSON.parse(query(difference('price_history_reference','price_history_all')));assert.equal(readDuring.leftOnly+readDuring.rightOnly,0,'INTEGRITY_READ_DIRTY_MOVE');
   const second=actor(name+'-b',b);await poll(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity b JOIN pg_stat_activity a ON a.pid=ANY(pg_blocking_pids(b.pid)) WHERE a.application_name=${lit(name+'-a')} AND b.application_name=${lit(name+'-b')});`);
   const [ra,rb]=await Promise.all([first,second]);assert.equal(ra.code,0,ra.err);assert.equal(rb.code,bCode,rb.err);if(bCode!==0)assert.match(rb.err,/global history id collision/);
   concurrent.push({name,blockingObserved:true,readDuring,...assertIntegrity(),actors:[ra,rb]});
  };
  stage='concurrent-move';await pair('move-versus-collision',`SELECT cold_lab.move(${lit(hotId)}::uuid,true)`,
   `INSERT INTO price_history SELECT * FROM price_history_reference WHERE id=${lit(hotId)}::uuid ON CONFLICT(id)DO NOTHING`,3);
  await pair('move-versus-restore',`SELECT cold_lab.move(${lit(coldId)}::uuid,false)`,
   `SELECT cold_lab.restore(ROW(r.*)::price_history)FROM price_history_reference r WHERE id=${lit(coldId)}::uuid`,0);
  await pair('restore-versus-move',`SELECT cold_lab.restore(ROW(r.*)::price_history)FROM price_history_reference r WHERE id=${lit(coldId)}::uuid`,
   `SELECT cold_lab.move(${lit(coldId)}::uuid,true)`,0);
  // Vuelve al corte exacto antes de probar escritores; conserva el OID físico original.
  query(`SELECT cold_lab.move(${lit(hotId)}::uuid,false);`);assert.equal(query("SELECT 'price_history'::regclass::oid;"),hotOid);
  query(`BEGIN;SELECT cold_lab.move(${lit(coldId)}::uuid,false);ROLLBACK;
   BEGIN;INSERT INTO price_history SELECT * FROM price_history WHERE id=${lit(hotId)}::uuid ON CONFLICT(id)DO UPDATE SET price=excluded.price+1;ROLLBACK;
   DO $$BEGIN BEGIN UPDATE price_history SET id=gen_random_uuid()WHERE id=${lit(hotId)}::uuid;
    RAISE EXCEPTION 'UUID mutation accepted';EXCEPTION WHEN check_violation THEN NULL;END;END $$;`);
  assert.equal(query(`SELECT cold FROM cold_lab.history_ids WHERE id=${lit(coldId)}::uuid;`),'t');assertIntegrity();
  const afterRollback=JSON.parse(query(difference('price_history_reference','price_history_all')));assert.equal(afterRollback.leftOnly+afterRollback.rightOnly,0);
  stage='existing-writers';query(`ALTER TABLE products ADD COLUMN name text DEFAULT 'Fixture CPU',ADD COLUMN last_scraped_at timestamptz;
   ALTER TABLE product_prices ADD COLUMN id uuid DEFAULT gen_random_uuid(),ADD COLUMN original_price numeric(14,2),ADD COLUMN installment_count integer,
    ADD COLUMN installment_amount numeric(14,2),ADD COLUMN last_updated timestamptz DEFAULT now()-interval '1 day',ADD COLUMN state_signature text,
    ADD COLUMN identity_review jsonb,ADD COLUMN updated_at timestamptz,ADD COLUMN source_identity jsonb,ADD COLUMN price_condition text;
   CREATE TABLE requested_offer_refreshes(id uuid PRIMARY KEY,status text,lease_token uuid,expires_at timestamptz,started_at timestamptz,targets jsonb);
   CREATE TABLE catalog_offer_refresh_state(offer_id uuid,lease_token uuid,leased_until timestamptz);
   CREATE FUNCTION catalog_identity_text(text)RETURNS text LANGUAGE sql IMMUTABLE AS $$SELECT $1$$;`);
  for(const name of sourceFiles.slice(0,3))for(const fn of funcs(sources[name]))query(fn);
  const locks=sources[sourceFiles[3]];query(locks.slice(locks.indexOf('alter function public.persist_catalog_offers(jsonb) rename'),locks.lastIndexOf('commit;')));
  for(const name of sourceFiles.slice(4,7))for(const fn of funcs(sources[name]).filter(fn=>!name.includes('inventory')||fn.includes('function public.persist_catalog_offers(')))query(fn);
  const offers=fixture.offers.filter(o=>o.product_id==='cpu-a'),writerResults=[];
  const writerTest=(name,sql,expected)=>{const before=Number(query('SELECT count(*)FROM price_history;'));
   const result=query(sql);const after=Number(query('SELECT count(*)FROM price_history;'));assert.equal(after-before,expected,name);assertIntegrity();writerResults.push({name,historyRowsAdded:after-before,result});};
  const general=()=>`SELECT persist_catalog_offers(${lit(JSON.stringify(offers.map(o=>({...o,price:'111.11',original_price:null,last_updated:new Date().toISOString(),state_signature:'fixture',source_identity:{title:'Fixture CPU',listingRef:o.url}}))))}::jsonb);`;
  writerTest('catalog-change',general(),1);writerTest('catalog-idempotent',general(),0);
  const source=lit(JSON.stringify({title:'Fixture CPU',listingRef:offers[0].url})),url=lit(offers[0].url);
  const priority=`SELECT persist_verified_priority_offer('cpu-a','store-a',${url},112.22,NULL,'low-stock',1,112.22,now(),now(),NULL,'priority',${source}::jsonb,'unspecified');`;
  writerTest('verified-priority-change',priority,1);writerTest('verified-priority-idempotent',priority,0);
  const job=uuid(90001),token=uuid(90002);query(`INSERT INTO requested_offer_refreshes VALUES(${lit(job)}::uuid,'running',${lit(token)}::uuid,now()+interval '1 hour',now()-interval '1 minute',
   ${lit(JSON.stringify([{productId:'cpu-a',storeId:'store-a',url:offers[0].url}]))}::jsonb);`);
  const requested=`SELECT persist_verified_requested_offer(${lit(job)}::uuid,${lit(token)}::uuid,'cpu-a','store-a',${url},113.33,NULL,'in-stock',1,113.33,now(),NULL,'requested',${source}::jsonb,'unspecified');`;
  writerTest('verified-requested-change',requested,1);writerTest('verified-requested-idempotent',requested,0);
  query(`INSERT INTO catalog_offer_refresh_state SELECT id,${lit(token)}::uuid,now()+interval '1 hour'FROM product_prices WHERE product_id='cpu-a';`);
  const adaptive=`SELECT persist_adaptive_offer((SELECT id FROM product_prices WHERE product_id='cpu-a'),${lit(token)}::uuid,114.44,NULL,'unknown',1,114.44,now(),now(),NULL,'adaptive',${source}::jsonb,'unspecified');`;
  writerTest('adaptive-change',adaptive,1);writerTest('adaptive-idempotent',adaptive,0);
  stage='cascade-retention-restore';query(`BEGIN;UPDATE products SET id='cpu-a-renamed'WHERE id='cpu-a';UPDATE stores SET id='store-a-renamed'WHERE id='store-a';SET CONSTRAINTS ALL IMMEDIATE;ROLLBACK;
   DO $$BEGIN BEGIN DELETE FROM stores WHERE id='store-a';RAISE EXCEPTION 'store restriction missing';EXCEPTION WHEN foreign_key_violation THEN NULL;END;END $$;
   BEGIN;DELETE FROM products WHERE id='cpu-a';SET CONSTRAINTS ALL IMMEDIATE;
   DO $$BEGIN IF EXISTS(SELECT 1 FROM price_history_all WHERE product_id='cpu-a') OR EXISTS(SELECT 1 FROM cold_lab.history_ids r WHERE NOT EXISTS(SELECT 1 FROM price_history_all h WHERE h.id=r.id))THEN RAISE EXCEPTION 'cascade registry orphan';END IF;END $$;ROLLBACK;`);
  const cleanup=funcs(sources[sourceFiles[7]]).find(fn=>fn.includes('function public.cleanup_price_history('));assert.ok(cleanup);query(cleanup);
  const [retentionProbe,retentionIntegrity]=query(`BEGIN;SELECT cleanup_price_history(interval '1 day',interval '2 days',interval '3 days');
   SELECT jsonb_build_object('rows',(SELECT count(*)FROM price_history_all),'registry',(SELECT count(*)FROM cold_lab.history_ids),
    'duplicates',(SELECT count(*)-count(DISTINCT id)FROM price_history_all),
    'orphans',(SELECT count(*)FROM cold_lab.history_ids r WHERE NOT EXISTS(SELECT 1 FROM price_history_all h WHERE h.id=r.id)));
   SET CONSTRAINTS ALL IMMEDIATE;ROLLBACK;`).split('\n').map(JSON.parse);
  assert.ok(retentionProbe.deletedRows>0);assert.equal(retentionIntegrity.rows,retentionIntegrity.registry);
  assert.equal(retentionIntegrity.duplicates+retentionIntegrity.orphans,0);assertIntegrity();
  query(`BEGIN;DELETE FROM price_history_cold WHERE id=${lit(coldId)}::uuid;SELECT cold_lab.restore(ROW(r.*)::price_history)FROM price_history_reference r WHERE id=${lit(coldId)}::uuid;
   SET CONSTRAINTS ALL IMMEDIATE;COMMIT;`);const final=assertIntegrity();
  const catalogLogicalBytes=JSON.parse(query(`WITH added AS(SELECT * FROM pg_constraint WHERE conrelid='cold_lab.history_ids'::regclass
   OR conname IN('price_history_global_id_fk','price_history_cold_global_id_fk'))SELECT jsonb_build_object(
   'triggerTupleBytes',(SELECT sum(pg_column_size(t))FROM pg_trigger t WHERE tgfoid IN(SELECT oid FROM pg_proc WHERE pronamespace='cold_lab'::regnamespace)OR tgconstraint IN(SELECT oid FROM added)),
   'triggerCount',(SELECT count(*)FROM pg_trigger t WHERE tgfoid IN(SELECT oid FROM pg_proc WHERE pronamespace='cold_lab'::regnamespace)OR tgconstraint IN(SELECT oid FROM added)),
   'functionTupleBytes',(SELECT sum(pg_column_size(p))FROM pg_proc p WHERE pronamespace='cold_lab'::regnamespace),
   'constraintTupleBytes',(SELECT sum(pg_column_size(c))FROM added c),'constraintCount',(SELECT count(*)FROM added));`));
  receipt={success:true,startedAt,localOnly:true,noTcp:true,postgresVersion:version,fixture:{source:typedFile,sha256:typedHash,rows:fixture.quotes.length,dayBuenosAires:day,cutoff},
   sources:Object.fromEntries(Object.entries(sources).map(([name,text])=>[name,sha(text)])),rpc:{sha256:sha(rpc),definitionMd5:'690e0fd5f366627d274ab78416463312'},
   invariants:{physicalHotOidPreserved:true,exactEightFields:exact,parity,globalCollisionRejected:true,sameHotOnConflictNoop:true,
    crossTableOnConflictNoopRejects:true,restoreRepeatedExact:true,restoreContentConflictRejects:true,deferredOwnershipBypassRejects:true,
    movementRollbackEightFields:afterRollback,sameHotOnConflictUpdateRollback:true,uuidMutationRejected:true,
    parentUpdatesCascade:true,productDeletionCascade:true,storeDeletionRestrict:true,retentionDeletionRollback:retentionProbe,retentionIntegrity,restoreAfterDeletion:true,final},
   concurrent,writerResults,sizes:{baseline,databaseBeforeRegistry,installed,duringTransaction: during,afterCommit,afterCompact:compact,catalogLogicalBytes},
   limitations:['Synthetic 1487 rows, not a capacity forecast or representative production distribution.',
    'Registry serializes supported DML; superuser disabling triggers/TRUNCATE/direct registry DELETE are outside this contract.',
    'UUID UPDATE is explicitly rejected; current tested writers generate a new UUID and do not update it.',
    'Cross-table INSERT ON CONFLICT(id) DO NOTHING raises23505; internal restore must route by locked registry.',
    'Public hardware_price_index remains hot-only; candidate union parity does not publish the reader.',
    'Cleanup executes hot-only existing policy in rolled-back transaction, not a cold retention implementation.',
    'Synthetic parent schemas omit real read-model triggers, production RLS and service-role grants.',
    'No concurrency proof for parent cascade/cleanup versus move; deadlock ordering requires separate audit.',
    'Catalog logical tuple bytes are not allocated pg_catalog/index bytes; transaction sample is not a full rollback/rewrite peak.',
    'Local WAL delta includes deferred work only up to sample; no remote latency or PostgreSQL CPU/RSS measured.'],scriptSha256:sha(await fs.readFile(import.meta.filename))};
 }catch(error){receipt={success:false,startedAt,localOnly:true,stage,reason:error.message,diagnostic:String(error.stderr??'').slice(0,2500)};}
 finally{
  for(const child of children)child.kill('SIGTERM');let stopped=!running;
  if(running)try{run('pg_ctl',['-D',path.join(local,'d'),'-m','fast','-w','stop']);stopped=true;}catch{stopped=false;receipt.success=false;receipt.cleanupError='INTEGRITY_CLUSTER_STOP_FAILED';}
  if(local&&stopped)await fs.rm(local,{recursive:true,force:true});receipt.clusterStopped=stopped;receipt.clusterDirectoryRemoved=Boolean(local&&stopped);
  receipt.completedAt=new Date().toISOString();receipt.wallMs=Math.round(performance.now()-start);receipt.nodeCpuMicros=process.cpuUsage(cpu);receipt.nodeMemoryAfterLab=process.memoryUsage();
  await fs.writeFile(path.join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
 }
 assert.equal(receipt.success,true,'INTEGRITY_LAB_FAILED');return{output:path.relative(root,output),success:true,sizes:receipt.sizes,concurrencyCases:receipt.concurrent.length,clusterStopped:receipt.clusterStopped};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)runHistoryColdIntegrityLab()
 .then(x=>process.stdout.write(JSON.stringify(x,null,2)+'\n')).catch(e=>{process.stderr.write(e.message+'\n');process.exitCode=1;});
