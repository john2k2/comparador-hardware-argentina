// Segundo oráculo privado: clonar el esquema probado y cargar otra captura real.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import {once} from 'node:events';
import {verifySnapshot} from './snapshot-verify.mjs';
const [baseSnapshot,newSnapshot]=process.argv.slice(2);
if(!baseSnapshot||!newSnapshot)throw new Error('Usar BASE_SNAPSHOT NUEVO_SNAPSHOT');
const target=path.resolve(newSnapshot),manifest=await verifySnapshot(target);
const state=JSON.parse(fs.readFileSync(path.join(baseSnapshot,'postgres-state.json'),'utf8'));
const parent=fs.realpathSync(path.dirname(state.data));
if(!state.ready||!state.noTcp||state.database!=='catalog_pilot'||state.port!=='55527'
 ||!path.basename(parent).startsWith('comparador-catalog-')||(fs.statSync(parent).mode&0o077)!==0
 ||fs.realpathSync(state.data)!==path.join(parent,'data')||fs.realpathSync(state.socket)!==path.join(parent,'socket'))throw new Error('Oráculo privado inesperado');
const statePath=path.join(target,'postgres-state.json');
if(fs.existsSync(statePath))throw new Error('Conservar oráculo existente');
const env={...process.env};for(const key of Object.keys(env))if(key.startsWith('PG'))delete env[key];
const pg='/opt/homebrew/opt/postgresql@17/bin/',database='catalog_pilot_incremental';
const args=['-X','-h',state.socket,'-p',state.port,'-U','postgres','-d',database,'-Atq','-v','ON_ERROR_STOP=1'];
const sql=query=>execFileSync(pg+'psql',args,{env,input:query,encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024});
execFileSync(pg+'createdb',['-h',state.socket,'-p',state.port,'-U','postgres','--template',state.database,database],{env,timeout:120000});
if(sql('show listen_addresses;').trim()!=='')throw new Error('El oráculo no debe escuchar TCP');
const meta=JSON.parse(fs.readFileSync(path.join(target,'schema.json'),'utf8'));
sql('truncate public.products cascade; truncate public.stores cascade;');
for(const table of ['stores','products','product_prices','catalog_price_summaries']) {
  const columns=meta.columns.filter(c=>c.table===table&&c.generated!=='ALWAYS').map(c=>c.name);
  if(!columns.length||columns.some(c=>!/^[a-z_]+$/.test(c)))throw new Error('Columnas inesperadas');
  const child=spawn(pg+'psql',args,{env,stdio:['pipe','pipe','pipe']});let errors='';child.stdout.resume();child.stderr.on('data',c=>errors=(errors+c).slice(-4000));const completion=once(child,'close');
  child.stdin.write("begin; set local session_replication_role=replica; create temp table import_rows(data jsonb); copy import_rows from stdin with (format csv, quote E'\\x01', delimiter E'\\x02');\n");
  for(const line of fs.readFileSync(path.join(target,table+'.jsonl'),'utf8').split('\n'))if(line){
    if(line.includes('\x01')||line.includes('\x02'))throw new Error('Carácter incompatible');
    if(!child.stdin.write(line+'\n'))await once(child.stdin,'drain');
  }
  child.stdin.end('\\.\ninsert into public.'+table+'('+columns.join(',')+') select '+columns.map(c=>'r.'+c).join(',')+' from import_rows i cross join lateral jsonb_populate_record(null::public.'+table+',i.data) r; commit;\n');
  const [code]=await completion;if(code!==0)throw new Error(table+':'+errors);
  const count=Number(sql('select count(*) from public.'+table));
  if(count!==manifest.tables.find(t=>t.table===table).count)throw new Error('Conteo incorrecto');
}
sql("create or replace function public.pilot_now() returns timestamptz language sql stable as $$ select '"+manifest.referenceNow.replaceAll("'","''")+"'::timestamptz $$;");
sql('insert into public.products_search_lookup select id,category,catalog_identity,catalog_name,catalog_document from public.products where catalog_component;');
sql('analyze;');
fs.writeFileSync(statePath,JSON.stringify({...state,database,referenceNow:manifest.referenceNow,certifiedSnapshot:undefined,sourceCaptureAtomic:false,clonedFrom:state.database},null,2),{mode:0o600});
console.log(JSON.stringify({localOnly:true,database,referenceNow:manifest.referenceNow}));
