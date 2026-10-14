// Integridad de la copia pública y de su proyección D1, sin conexión remota.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { observationTimeSql } from './observation-time.mjs';
const directory=path.resolve(process.argv[2]??'outputs/catalogo-local-cloudflare-2026-10-11');
const state=JSON.parse(fs.readFileSync(path.join(directory,'public-snapshot/postgres-state.json')));
const source=state.certifiedSnapshot??path.join(directory,'public-snapshot');
const manifest=JSON.parse(fs.readFileSync(path.join(source,'manifest.json')));
if(!state.ready||!state.noTcp||!state.socket.includes('/comparador-catalog-'))throw new Error('Oráculo privado no disponible');
const checks=[];
for(const table of manifest.tables) {
 const bytes=fs.readFileSync(path.join(source,table.table+'.jsonl'));
 const hash=createHash('sha256').update(bytes).digest('hex');
 const count=bytes.toString().split('\n').filter(Boolean).length;
 checks.push({check:table.table+' hash/conteo/página final',pass:hash===table.sha256&&count===table.count&&table.terminatedOnEmptyPage,count,hash});
}
const db=new DatabaseSync(path.join(directory,'catalog-search-compact.sqlite'),{readOnly:true});
const integrity=db.prepare('PRAGMA integrity_check').get().integrity_check;
checks.push({check:'SQLite integrity_check',pass:integrity==='ok',value:integrity});
const queries={
 'ofertas sin producto':'SELECT COUNT(*) AS n FROM product_prices pp LEFT JOIN products p ON pp.product_id=p.id WHERE p.id IS NULL',
 'ofertas sin tienda':'SELECT COUNT(*) AS n FROM product_prices pp LEFT JOIN stores s ON pp.store_id=s.id WHERE s.id IS NULL',
 'resumen sin producto':'SELECT COUNT(*) AS n FROM summaries s LEFT JOIN products p ON s.product_id=p.id WHERE p.id IS NULL',
 'base de precios inconsistente':`SELECT COUNT(*) AS n FROM price_basis b LEFT JOIN product_prices pp ON b.id=pp.id
 WHERE pp.id IS NULL OR b.product_id<>pp.product_id OR b.store_id<>pp.store_id OR b.price<>pp.price OR b.url IS NOT pp.url
 OR b.stock IS NOT json_extract(pp.row_json,'$.stock')
 OR (b.kind='current' AND b.observed_at IS NOT ${observationTimeSql("json_extract(pp.row_json,'$.last_updated')")})`,
};
for(const [check,query] of Object.entries(queries)){const value=Number(db.prepare(query).get().n);checks.push({check,pass:value===0,value});}
const categories=db.prepare('SELECT category,COUNT(*) AS products FROM products GROUP BY category ORDER BY category').all();
const expected=new Set(fs.readFileSync(path.join(source,'catalog_price_summaries.jsonl'),'utf8').split('\n').filter(Boolean).flatMap(line=>{
 const row=JSON.parse(line);return (row.comparable_offers??[]).map(offer=>row.product_id+'|'+offer.id);
}));
const actual=new Set(db.prepare("SELECT product_id,id FROM price_basis WHERE kind='current'").all().map(row=>row.product_id+'|'+row.id));
checks.push({check:'identidades de ofertas en proyección certificada',pass:actual.size===expected.size&&[...actual].every(key=>expected.has(key)),actual:actual.size,expected:expected.size});
const missingSummaries=Number(db.prepare('SELECT COUNT(*) AS n FROM products p LEFT JOIN summaries s ON p.id=s.product_id WHERE s.product_id IS NULL').get().n);
db.close();
const env={...process.env};for(const key of Object.keys(env))if(key.startsWith('PG'))delete env[key];
const sql=`SELECT count(*) FROM public.catalog_price_summaries s
 CROSS JOIN LATERAL jsonb_to_recordset(coalesce(s.comparable_offers,'[]')) o(id uuid)
 JOIN public.product_prices pp ON pp.id=o.id JOIN public.products p ON p.id=pp.product_id
 WHERE NOT public.catalog_offer_is_comparable(pp.price,pp.stock,pp.url,pp.identity_review,p.name,p.category,pp.source_identity,pp.store_id);`;
const invalid=Number(execFileSync('/opt/homebrew/opt/postgresql@17/bin/psql',['-X','-h',state.socket,'-p',state.port,'-U','postgres','-d',state.database,'-Atq','-v','ON_ERROR_STOP=1','-c',sql],{env,encoding:'utf8',timeout:30000}));
checks.push({check:'elegibilidad estructural contra funciones PostgreSQL reales',pass:invalid===0,value:invalid});
const report={localOnly:true,atomicRemoteSnapshot:false,referenceNow:state.referenceNow,passed:checks.filter(c=>c.pass).length,total:checks.length,checks,categories,productsWithoutSummary:missingSummaries};
fs.writeFileSync(path.join(directory,'integrity-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
process.exitCode=report.passed===report.total?0:1;
