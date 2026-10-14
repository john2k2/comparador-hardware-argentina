// Proyección derivada: excluir conflictos estructurales sin alterar la captura.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { verifySnapshot } from './snapshot-verify.mjs';
const directory=path.resolve(process.argv[2]??'outputs/catalogo-local-cloudflare-2026-10-11');
const source=path.join(directory,'public-snapshot'),target=path.join(directory,'certified-snapshot');
const manifest=await verifySnapshot(source);
const state=JSON.parse(fs.readFileSync(path.join(source,'postgres-state.json')));
if(!state.ready||!state.noTcp||!state.socket.includes('/comparador-catalog-')) throw new Error('Oráculo privado no listo');
if(fs.existsSync(target))throw new Error('Conservar proyección existente');
const env={...process.env};for(const key of Object.keys(env))if(key.startsWith('PG'))delete env[key];
const sql=query=>execFileSync('/opt/homebrew/opt/postgresql@17/bin/psql',['-X','-h',state.socket,'-p',state.port,'-U','postgres','-d',state.database,'-Atq','-v','ON_ERROR_STOP=1','-c',query],{env,encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024}).trim();
const conflicts=JSON.parse(sql(`SELECT coalesce(jsonb_agg(to_jsonb(v)),'[]') FROM (
 SELECT DISTINCT pp.id,pp.product_id,p.name,p.category,pp.url,pp.price,pp.stock
 FROM public.catalog_price_summaries s CROSS JOIN LATERAL jsonb_to_recordset(s.comparable_offers) o(id uuid)
 JOIN public.product_prices pp ON pp.id=o.id JOIN public.products p ON p.id=pp.product_id
 WHERE NOT public.catalog_offer_is_comparable(pp.price,pp.stock,pp.url,pp.identity_review,p.name,p.category,pp.source_identity,pp.store_id)) v;`));
const ids=[...new Set(conflicts.map(row=>row.product_id))];
const literal=value=>"'"+value.replaceAll("'","''")+"'";
// El mismo refresco derivado que las migraciones del proyecto, con reloj local.
const ddl=sql("select pg_get_functiondef('public.sync_catalog_comparable_summary(text)'::regprocedure);");
sql(ddl.replace(/\bnow\(\)/g,'public.pilot_now()'));
const changed=[];
for(const id of ids) {
 sql('select public.sync_catalog_comparable_summary('+literal(id)+');');
 changed.push(JSON.parse(sql('select to_jsonb(s) from public.catalog_price_summaries s where product_id='+literal(id)+';')));
}
fs.mkdirSync(target,{mode:0o700});
for(const file of ['products.jsonl','stores.jsonl','product_prices.jsonl'])fs.linkSync(path.join(source,file),path.join(target,file));
fs.copyFileSync(path.join(source,'schema.json'),path.join(target,'schema.json'));
const map=new Map(changed.map(row=>[row.product_id,row]));
const output=fs.readFileSync(path.join(source,'catalog_price_summaries.jsonl'),'utf8').split('\n').filter(Boolean).map(line=>{const row=JSON.parse(line);return JSON.stringify(map.get(row.product_id)??row);}).join('\n')+'\n';
fs.writeFileSync(path.join(target,'catalog_price_summaries.jsonl'),output,{mode:0o600});
const derived=structuredClone(manifest),entry=derived.tables.find(t=>t.table==='catalog_price_summaries');
entry.bytes=Buffer.byteLength(output);entry.sha256=createHash('sha256').update(output).digest('hex');
derived.derivedAt=new Date().toISOString();derived.derivedFrom=source;derived.structuralConflictsExcluded=conflicts;
fs.writeFileSync(path.join(target,'manifest.json'),JSON.stringify(derived,null,2),{mode:0o600});
fs.writeFileSync(path.join(directory,'certification-patch.json'),JSON.stringify({localOnly:true,referenceNow:manifest.referenceNow,conflicts,changedSummaries:changed},null,2),{mode:0o600});
await verifySnapshot(target);
state.certifiedSnapshot=target;fs.writeFileSync(path.join(source,'postgres-state.json'),JSON.stringify(state,null,2),{mode:0o600});
console.log(JSON.stringify({localOnly:true,conflicts:conflicts.length,changedSummaries:changed.length,certifiedSnapshot:target}));
