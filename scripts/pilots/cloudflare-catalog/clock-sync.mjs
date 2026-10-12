// Transporte de mantenimiento: no escribe productos, ofertas ni observaciones.
const fixed=['product_id','category','catalog_identity','canonical'];
const derived=['lowest','highest','average','available','comparable_available','urls','observed_at','next_transition'];
const fields=[...fixed,...derived],limit=2000,byteLimit=1024*1024;
const error=code=>{throw new Error('CLOCK_SYNC_'+code);};
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
  &&[Object.prototype,null].includes(Object.getPrototypeOf(value))&&!Object.getOwnPropertySymbols(value).length
  &&Object.values(Object.getOwnPropertyDescriptors(value)).every(descriptor=>Object.hasOwn(descriptor,'value')&&descriptor.enumerable);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const date=value=>typeof value==='string'&&value.length<=32&&Number.isFinite(Date.parse(value));
const bytes=value=>new TextEncoder().encode(value).byteLength;
function row(value){
  if(!plain(value)||Object.keys(value).length!==fields.length||fields.some(key=>!Object.hasOwn(value,key)))error('ROW');
  for(const key of ['product_id','category','catalog_identity'])if(typeof value[key]!=='string'||!value[key]||value[key].length>(key==='catalog_identity'?2048:256))error('TYPE');
  if(![0,1].includes(value.canonical))error('TYPE');
  for(const key of ['lowest','highest','average'])if(value[key]!==null&&(typeof value[key]!=='number'||!Number.isFinite(value[key])||value[key]<0))error('TYPE');
  for(const key of ['available','comparable_available'])if(value[key]!==null&&(!Number.isSafeInteger(value[key])||value[key]<0||value[key]>1000000))error('TYPE');
  if(value.urls!==null&&(typeof value.urls!=='string'||value.urls.length>16384))error('TYPE');
  if(value.observed_at!==null&&!date(value.observed_at)||!date(value.next_transition))error('DATE');
}
function marker(raw){
  if(typeof raw!=='string'||bytes(raw)>16384)error('SNAPSHOT');
  let value;try{value=JSON.parse(raw);}catch{error('SNAPSHOT');}
  if(!plain(value)||value.projectionVersion!==1||!plain(value.cache)||value.cache.version!==1
    ||typeof value.cache.generation!=='string'||!value.cache.generation||value.cache.generation.length>128
    ||!date(value.cache.validFrom)||!date(value.cache.validUntil)
    ||Date.parse(value.cache.validUntil)<=Date.parse(value.cache.validFrom))error('SNAPSHOT');
  return value;
}
function budget(maxRowsWritten,count){
  // Fila + hasta tres índices de derivados; guard/marker con margen REPLACE.
  if(!Number.isSafeInteger(maxRowsWritten)||maxRowsWritten<0||4*count+8>maxRowsWritten)error('BUDGET');
}
export function validateClockSync(payload,{now=Date.now(),maxRowsWritten}={}){
  if(!plain(payload)||Object.keys(payload).length!==6||payload.version!==1||!Number.isSafeInteger(payload.now)
    ||!Number.isSafeInteger(now)||!Number.isSafeInteger(payload.expectedProjectionCount)||payload.expectedProjectionCount<0
    ||!Array.isArray(payload.rows)||payload.rows.length>limit)error('PAYLOAD');
  budget(maxRowsWritten,payload.rows.length);
  const previous=marker(payload.expectedSnapshot),final=marker(payload.finalSnapshot);
  if(payload.expectedSnapshot===payload.finalSnapshot||previous.cache.generation===final.cache.generation
    ||!same({...previous,cache:null},{...final,cache:null})
    ||Object.keys(final.cache).sort().join(',')!=='generation,validFrom,validUntil,version'
    ||Date.parse(final.cache.validFrom)!==payload.now||payload.now>Date.parse(final.cache.validUntil)
    ||payload.now<Date.parse(previous.cache.validFrom)||payload.now>now||Date.parse(final.cache.validUntil)<=now)error('CLOCK');
  const ids=new Set();
  for(const change of payload.rows){
    if(!plain(change)||Object.keys(change).sort().join(',')!=='after,before')error('ROW');
    row(change.before);
    if(!plain(change.after)||!Object.keys(change.after).length||Object.keys(change.after).some(key=>!derived.includes(key)
      ||change.after[key]===change.before[key]))error('ROW');
    const finalRow={...change.before,...change.after};row(finalRow);
    if(ids.has(change.before.product_id))error('MEMBERSHIP');
    if(Date.parse(finalRow.next_transition)<=payload.now)error('CLOCK');
    ids.add(change.before.product_id);
  }
  if(ids.size>payload.expectedProjectionCount)error('MEMBERSHIP');
  if(bytes(JSON.stringify(payload))>byteLimit)error('SIZE');
  return payload;
}
const projection=db=>db.prepare('SELECT * FROM search_projection ORDER BY product_id').all().map(value=>({...value}));
const snapshot=db=>db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get()?.value;
function rows(db,table){
  // Comparación completa sólo en la Mac; orden independiente de PK/rowid.
  return db.prepare(`SELECT * FROM ${table}`).all().map(value=>JSON.stringify({...value})).sort();
}
export function buildClockSyncDelta(before,after,{now=Date.now(),maxRowsWritten}={}){
  for(const table of ['products','product_prices','summaries','price_basis','stores'])if(!same(rows(before,table),rows(after,table)))error('IMMUTABLE_'+table.toUpperCase());
  const old=projection(before),next=projection(after);
  if(old.length!==next.length||old.some((value,index)=>fixed.some(key=>value[key]!==next[index][key])))error('MEMBERSHIP');
  const changes=next.flatMap((value,index)=>same(old[index],value)?[]:[{before:old[index],
    after:Object.fromEntries(derived.filter(key=>old[index][key]!==value[key]).map(key=>[key,value[key]]))}]);
  const expectedSnapshot=snapshot(before),finalSnapshot=snapshot(after);
  if(expectedSnapshot===finalSnapshot){if(changes.length)error('SNAPSHOT');
    if(!Number.isSafeInteger(maxRowsWritten)||maxRowsWritten<0)error('BUDGET');return null;}
  const payload=validateClockSync({version:1,now,expectedProjectionCount:old.length,expectedSnapshot,finalSnapshot,rows:changes},{now,maxRowsWritten});
  const minimum=next.reduce((min,value)=>value.next_transition<min?value.next_transition:min,'9999-12-31T23:59:59.999Z');
  if(JSON.parse(finalSnapshot).cache.validUntil!==minimum)error('HORIZON');
  return payload;
}

export async function applyClockSync(db,input,{now=Date.now(),maxRowsWritten}={}){
  const p=validateClockSync(input,{now,maxRowsWritten}),statements=[],encoded=JSON.stringify(p.rows);
  // Un solo documento JSON por statement; nunca n parámetros por fila.
  const add=(sql,values=[])=>statements.push(db.prepare(sql).bind(...values));
  // json_type distingue atributo omitido de NULL explícito: COALESCE no basta.
  const finalValue=key=>`CASE WHEN json_type(j.value,'$.after.${key}') IS NULL THEN json_extract(j.value,'$.before.${key}') ELSE json_extract(j.value,'$.after.${key}') END`;
  const match=side=>fields.map(key=>`s.${key} IS ${side==='before'?`json_extract(j.value,'$.before.${key}')`:finalValue(key)}`).join(' AND ');
  const complete=(side,source='json_each(?)')=>`NOT EXISTS(SELECT 1 FROM ${source} j LEFT JOIN search_projection s ON s.product_id=json_extract(j.value,'$.before.product_id') WHERE s.product_id IS NULL OR NOT(${match(side)}))`;
  add('CREATE TABLE IF NOT EXISTS pilot_clock_sync_guard(id INTEGER PRIMARY KEY CHECK(id=1),expected TEXT NOT NULL,actual TEXT NOT NULL CHECK(expected=actual))');
  // ACK final también acredita conteo y targets; un snapshot solo no basta.
  add(`WITH changes AS MATERIALIZED(SELECT value FROM json_each(?)) INSERT OR REPLACE INTO pilot_clock_sync_guard SELECT 1,'ready',CASE WHEN
    (SELECT COUNT(*) FROM search_projection)=? AND (
      ((SELECT value FROM pilot_meta WHERE key='snapshot')=? AND ${complete('before','changes')}) OR
      ((SELECT value FROM pilot_meta WHERE key='snapshot')=? AND ${complete('after','changes')})
    ) THEN 'ready' ELSE 'stale' END`,[encoded,p.expectedProjectionCount,p.expectedSnapshot,p.finalSnapshot]);
  add(`UPDATE search_projection AS s SET ${derived.map(key=>`${key}=${finalValue(key)}`).join(',')}
    FROM json_each(?) j WHERE s.product_id=json_extract(j.value,'$.before.product_id')
    AND (SELECT value FROM pilot_meta WHERE key='snapshot')=?`,[encoded,p.expectedSnapshot]);
  add(`INSERT OR REPLACE INTO pilot_clock_sync_guard SELECT 1,'complete',CASE WHEN ${complete('after')}
    THEN 'complete' ELSE 'partial' END`,[encoded]);
  add("UPDATE pilot_meta SET value=? WHERE key='snapshot' AND value=?",[p.finalSnapshot,p.expectedSnapshot]);
  // MIN usa projection_clock_idx. La generación y el horizonte se confirman juntos.
  add(`INSERT OR REPLACE INTO pilot_clock_sync_guard SELECT 1,'final',CASE WHEN
    (SELECT value FROM pilot_meta WHERE key='snapshot')=? AND (SELECT COUNT(*) FROM search_projection)=? AND
    COALESCE((SELECT MIN(next_transition) FROM search_projection),'9999-12-31T23:59:59.999Z')=?
    THEN 'final' ELSE 'invalid' END`,[p.finalSnapshot,p.expectedProjectionCount,JSON.parse(p.finalSnapshot).cache.validUntil]);
  add('DELETE FROM pilot_clock_sync_guard WHERE id=1');
  const result=await db.batch(statements);
  if(result.length!==7||result.some(value=>value.success!==true))error('BATCH_FAILED');
  return{atomic:true,statements:result.length,generation:JSON.parse(p.finalSnapshot).cache.generation,estimatedMaxRowsWritten:4*p.rows.length+8,
    applied:result[4].meta?.changes!==undefined?result[4].meta.changes>0:(result[4].meta?.rows_written??0)>0,
    rowsRead:result.reduce((sum,value)=>sum+(value.meta?.rows_read??0),0),
    rowsWritten:result.reduce((sum,value)=>sum+(value.meta?.rows_written??0),0)};
}
