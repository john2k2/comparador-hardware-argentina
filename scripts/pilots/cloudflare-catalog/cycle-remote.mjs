// Transporte del ciclo privado. No descubre ni publica nuevos productos.
import { DatabaseSync } from 'node:sqlite';
import { isDeepStrictEqual } from 'node:util';
import { validateSync } from './remote-sync.mjs';
export const PILOT_ORIGIN='https://catalog-search-free-pilot-20261011.ortiz-jonathan.workers.dev';
export function buildCycleDelta(before,after){
  const marker=db=>db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get().value;
  if(marker(before)===marker(after))return null;
  const payload={expectedSnapshot:marker(before),finalSnapshot:marker(after)};
  for(const [table,key] of [['product_prices','id'],['summaries','product_id'],['search_projection','product_id']]){
    const old=new Map(before.prepare(`SELECT * FROM ${table}`).all().map(row=>[row[key],row]));
    const rows=after.prepare(`SELECT * FROM ${table}`).all();
    if(old.size!==rows.length||rows.some(row=>!old.has(row[key])))throw new Error('CYCLE_MEMBERSHIP_CHANGED');
    payload[table]=rows.filter(row=>!isDeepStrictEqual({...old.get(row[key])},{...row}));
  }
  // Una reparación entre destinos EXISTENTES retira la base del modelo viejo
  // y reconstruye ambos. Nunca trasladar sólo el nuevo product_id.
  payload.basisProductIds=[...new Set(payload.product_prices.flatMap(row=>[row.product_id,before.prepare('SELECT product_id FROM product_prices WHERE id=?').get(row.id).product_id]))];
  payload.price_basis=after.prepare('SELECT * FROM price_basis WHERE product_id IN(SELECT value FROM json_each(?)) ORDER BY product_id,kind,id').all(JSON.stringify(payload.basisProductIds));
  return validateSync(payload);
}
export async function pilotState(token,{fetcher=fetch}={}){
  const r=await fetcher(PILOT_ORIGIN+'/api/pilot/state',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw new Error(r.status===503?'CYCLE_PILOT_STOPPED':'CYCLE_STATE_UNAVAILABLE');
  const body=await r.json();
  if(typeof body.snapshot!=='string'||!Number.isSafeInteger(body.rowsRead)||body.rowsRead<0)throw new Error('CYCLE_STATE_INVALID');
  return body;
}
export async function sendCycleDelta(payload,token,{fetcher=fetch}={}){
  validateSync(payload);
  const r=await fetcher(PILOT_ORIGIN+'/api/pilot/sync',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw new Error('CYCLE_SYNC_REJECTED');
  const body=await r.json();
  if(body.atomic!==true||body.generation!==JSON.parse(payload.finalSnapshot).cache.generation||!Number.isSafeInteger(body.rowsRead)||!Number.isSafeInteger(body.rowsWritten)||body.rowsRead<0||body.rowsWritten<0)throw new Error('CYCLE_SYNC_RECEIPT_INVALID');
  return body;
}
export function cycleDeltaFromFiles(beforeFile,afterFile){
  const before=new DatabaseSync(beforeFile,{readOnly:true}),after=new DatabaseSync(afterFile,{readOnly:true});
  try{return buildCycleDelta(before,after);}finally{before.close();after.close();}
}
