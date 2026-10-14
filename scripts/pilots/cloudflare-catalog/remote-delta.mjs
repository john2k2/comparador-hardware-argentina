// Compara dos copias locales y publica exclusivamente al Worker privado de muestra.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';
import { validateSync } from './remote-sync.mjs';
const [beforeFile,afterFile,tokenFile,output] = process.argv.slice(2);
if (!beforeFile || !afterFile || !tokenFile || !output) throw new Error('Uso: BEFORE AFTER TOKEN_PRIVADO REPORTE_NUEVO');
const before=new DatabaseSync(beforeFile,{readOnly:true}),after=new DatabaseSync(afterFile,{readOnly:true});
try {
  const payload={expectedSnapshot:before.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get().value,finalSnapshot:after.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get().value};
  for(const [table,key] of [['product_prices','id'],['summaries','product_id'],['search_projection','product_id']]) {
    const original=new Map(before.prepare(`SELECT * FROM ${table}`).all().map(row=>[row[key],JSON.stringify(row)]));
    payload[table]=after.prepare(`SELECT * FROM ${table}`).all().filter(row=>original.get(row[key])!==JSON.stringify(row));
    if(original.size!==after.prepare(`SELECT count(*) AS n FROM ${table}`).get().n)throw new Error('PILOT_DELTA_CANNOT_CHANGE_MEMBERSHIP');
  }
  payload.basisProductIds=[...new Set(payload.product_prices.map(p=>p.product_id))];
  payload.price_basis=after.prepare('SELECT * FROM price_basis WHERE product_id IN(SELECT value FROM json_each(?)) ORDER BY product_id,kind,id').all(JSON.stringify(payload.basisProductIds));
  validateSync(payload);
  const token=readFileSync(tokenFile,'utf8').trim();
  const response=await fetch('https://catalog-search-free-pilot-20261011.ortiz-jonathan.workers.dev/api/pilot/sync',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});
  const result=await response.json();
  const report={sample:true,status:response.status,counts:Object.fromEntries(['product_prices','summaries','search_projection','price_basis'].map(t=>[t,payload[t].length])),basisProductIds:payload.basisProductIds,result};
  writeFileSync(output,JSON.stringify(report,null,2),{flag:'wx',mode:0o600});
  if(!response.ok)throw new Error('PILOT_DELTA_REMOTE_REJECTED');
  console.log(JSON.stringify(report));
}finally{before.close();after.close();}
