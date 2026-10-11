// Comparación del motor D1/SQLite contra la RPC real, en PostgreSQL privado.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { performance } from 'node:perf_hooks';
import { searchCatalog } from './engine.mjs';
import { sqliteAdapter } from './sqlite-adapter.mjs';
const root=path.resolve(import.meta.dirname,'../../..');
const directory=path.resolve(process.argv[2]??path.join(root,'outputs/catalogo-local-cloudflare-2026-10-11'));
const state=JSON.parse(fs.readFileSync(path.join(directory,'public-snapshot/postgres-state.json')));
if(!state.ready||!state.noTcp||!state.socket.includes('/comparador-catalog-')) throw new Error('Oráculo local no listo');
const database=new DatabaseSync(path.join(directory,'catalog-search-compact.sqlite'),{readOnly:true});
const environment={...process.env};for(const key of Object.keys(environment)) if(key.startsWith('PG')) delete environment[key];
const run=promisify(execFile);
const literal=value=>value===null||value===undefined?'NULL':typeof value==='number'?String(value):"'"+String(value).replaceAll("'","''")+"'";
const cases=[
 ...['rtx 4060','rtx 4060 ti','rtx 5070','rx 7600','7600','ryzen 5 7600','ryzen 7 9800x3d','i5 14400f','ddr5 32gb','ddr5 16gb 6000mhz','ddr4 2x8gb 3200mhz','ssd 1tb','nvme','fuente 650w','b650','monitor 144hz','logitech','producto inexistente zzq993'].map(p_query=>({p_query})),
 ...['tarjetas-graficas','procesadores','memoria-ram','almacenamiento','motherboards','fuentes-alimentacion','gabinetes','perifericos','refrigeracion','computadoras'].map(p_category=>({p_query:'',p_category})),
 {p_query:'rtx 4060',p_stores:['mexx','compragamer']},
 {p_query:'rtx 4060',p_category:'tarjetas-graficas',p_min_price:0},
 {p_query:'rtx 5070',p_category:'tarjetas-graficas',p_min_price:0},
 {p_query:'rtx 5070',p_category:'tarjetas-graficas',p_min_price:0,p_stores:['compragamer'],p_sort:'price-asc'},
 {p_query:'rtx 5070 aero',p_min_price:0,p_stores:['beings']},
 {p_query:'ryzen 5500',p_category:'procesadores',p_min_price:0},
 {p_query:'ddr5 32gb',p_category:'memoria-ram',p_min_price:0},
 {p_query:'rtx 4060',p_sort:'price-asc'},
 {p_query:'rtx 4060',p_sort:'price-desc',p_page:2,p_page_size:5},
 {p_query:'rtx 4060',p_sort:'name'},
 {p_query:'rtx 4060',p_sort:'newest'},
 {p_query:'rtx 4060',p_page:9999,p_page_size:3},
 {p_query:'ddr5',p_category:'memoria-ram',p_min_price:50000,p_max_price:200000,p_sort:'price-asc'},
 {p_query:'',p_min_price:50000,p_max_price:100000,p_sort:'price-asc'},
 {p_query:"x'; DROP TABLE products; --"},
 {p_query:Array(60).fill('rtx').join(' '),p_category:'tarjetas-graficas',p_min_price:0},
 {p_query:'aa '.repeat(80)},
 {p_query:'zz '.repeat(79)+'zz'},
];
function normalized(value,key='') {
 if(Array.isArray(value)) return value.map(item=>normalized(item));
 if(value&&typeof value==='object') return Object.fromEntries(Object.keys(value).sort().map(name=>[name,normalized(value[name],name)]));
 if(typeof value==='string'&&/^\d{4}-\d\d-\d\dT/.test(value)&&Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
 return value;
}
function firstDifference(a,b,p='') {
 if(JSON.stringify(a)===JSON.stringify(b)) return null;
 if(a&&b&&typeof a==='object'&&typeof b==='object') {
  for(const key of new Set([...Object.keys(a),...Object.keys(b)])) {const d=firstDifference(a[key],b[key],p+'.'+key);if(d) return d;}
 }
 return {path:p,pg:a,sqlite:b};
}
const results=[];
for(const input of cases) {
 const p={p_query:'',p_category:null,p_stores:[],p_min_price:null,p_max_price:null,p_sort:'relevance',p_page:1,p_page_size:12,...input};
 const stores='ARRAY['+p.p_stores.map(literal).join(',')+']::text[]';
 const sql='select public.search_catalog_page('+[literal(p.p_query),literal(p.p_category),stores,literal(p.p_min_price),literal(p.p_max_price),literal(p.p_sort),literal(p.p_page),literal(p.p_page_size)].join(',')+');';
 let pg,local,pgMs,sqliteMs,error,difference;
 try {
  let start=performance.now();const response=await run('/opt/homebrew/opt/postgresql@17/bin/psql',['-X','-h',state.socket,'-p',state.port,'-U','postgres','-d',state.database,'-v','ON_ERROR_STOP=1','-Atq','-c',sql],{env:environment,maxBuffer:8*1024*1024,timeout:30000});pgMs=performance.now()-start;pg=JSON.parse(response.stdout);
  start=performance.now();local=await searchCatalog(sqliteAdapter(database),p,{now:Date.parse(state.referenceNow)});sqliteMs=performance.now()-start;
  difference=firstDifference(normalized(pg),normalized(local));
 } catch(e) {error=e.code??e.message;}
 const record={input,pass:!error&&!difference,pgMs,sqliteMs,pgTotal:pg?.total,sqliteTotal:local?.total,difference,error};results.push(record);console.log(JSON.stringify(record));
}
database.close();
const report={localOnly:true,referenceNow:state.referenceNow,sourceCaptureAtomic:false,passed:results.filter(r=>r.pass).length,total:results.length,results};
fs.writeFileSync(path.join(directory,'parity-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:report.passed,total:report.total}));
process.exitCode=report.passed===report.total?0:1;
