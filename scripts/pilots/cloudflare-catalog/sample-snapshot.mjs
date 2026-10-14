// Muestra cerrada derivada del catálogo certificado. No acredita cobertura total.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {loadIncrementalSnapshot} from './incremental-sync.mjs';
export async function sampleSnapshot({source,target,maxProducts=2000}) {
  if(!Number.isSafeInteger(maxProducts)||maxProducts<1||maxProducts>2000)throw new Error('SAMPLE_PRODUCT_BUDGET_INVALID');
  if(fs.existsSync(target))throw new Error('SAMPLE_TARGET_EXISTS');
  const full=await loadIncrementalSnapshot(source),selected=new Set(),families=new Map();
  const products=[...full.rows.products.values()].map(r=>r.row).filter(p=>p.catalog_component&&full.rows.catalog_price_summaries.has(p.id)).sort((a,b)=>a.id.localeCompare(b.id));
  const pick=(predicate,limit)=>{let count=0;for(const p of products)if(predicate(p)&&count++<limit)selected.add(p.id);};
  for(const p of products)families.set(p.category,true);
  for(const category of families.keys())pick(p=>p.category===category,20);
  pick(p=>p.catalog_document.includes('rtx'),80);
  pick(p=>p.catalog_document.includes('ryzen')&&p.catalog_document.includes('5500'),30);
  pick(p=>p.catalog_document.includes('logitech'),60);
  // Incluir destinos estructurados para una observación real posterior en la Mac.
  const known=new Set([...full.rows.product_prices.values()].filter(r=>['dinobyte','maxtecno','goldentechstore','compragamer'].includes(r.row.store_id)).map(r=>r.row.product_id));
  pick(p=>known.has(p.id)&&p.category==='procesadores',15);
  const keys=new Set(products.filter(p=>selected.has(p.id)).map(p=>JSON.stringify([p.category,p.catalog_identity])));
  // La preferencia canónica exige conservar todos los pares de identidad.
  for(const p of products)if(keys.has(JSON.stringify([p.category,p.catalog_identity])))selected.add(p.id);
  if(selected.size>maxProducts)throw new Error('SAMPLE_PRODUCT_BUDGET_EXCEEDED');
  fs.mkdirSync(target,{recursive:true,mode:0o700});
  const tables=[];
  for(const [table,map] of Object.entries(full.rows)) {
    const rows=[...map.values()].map(r=>r.row).filter(r=>table==='stores'||selected.has(table==='products'?r.id:r.product_id));
    const text=rows.map(r=>JSON.stringify(r)+'\n').join('');
    fs.writeFileSync(path.join(target,table+'.jsonl'),text,{flag:'wx',mode:0o600});
    tables.push({table,count:rows.length,sha256:createHash('sha256').update(text).digest('hex'),terminatedOnEmptyPage:true});
  }
  const manifest={version:1,localOnly:true,sample:true,sourceCaptureAtomic:false,sourceGeneration:full.generation,referenceNow:full.manifest.referenceNow,endedAt:full.manifest.endedAt,tables,
    selection:'20 por categoría, 80 RTX, 30 Ryzen 5500, 60 Logitech, 15 CPU estructurados más pares de identidad. Página vacía heredada del origen certificado completo; esto es una muestra derivada.'};
  fs.writeFileSync(path.join(target,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx',mode:0o600});
  return manifest;
}
if(process.argv[1]===new URL(import.meta.url).pathname) {
  const [source,target]=process.argv.slice(2);if(!source||!target)throw new Error('Usar SOURCE_CERTIFIED NEW_SAMPLE_DIR');
  console.log(JSON.stringify(await sampleSnapshot({source,target}),null,2));
}
