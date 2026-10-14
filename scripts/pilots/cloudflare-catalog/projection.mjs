// El runner local paga el cálculo de estadísticas; D1 recibe sólo diferencias.
import {readFileSync} from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import {candidatesSql,validateParams} from './engine.mjs';
import {prepareQuery} from './catalog-matchers.mjs';
const columns=['product_id','category','catalog_identity','canonical','lowest','highest','average','available','comparable_available','urls','observed_at','next_transition'];
const farFuture='9999-12-31T23:59:59.999Z';
export function rebuildProjection(db,{now=Date.now(),generation,affectedProductIds}={}) {
  if(!Number.isFinite(now)||!generation) throw new Error('Reloj/generación requeridos');
  db.exec(readFileSync(new URL('./projection.sql',import.meta.url),'utf8'));
  const marker=db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get();
  if(!marker) throw new Error('Snapshot incompleto');
  const meta=JSON.parse(marker.value),all=affectedProductIds===undefined||meta.projectionVersion!==1||now<Date.parse(meta.cache?.validFrom);
  if(!all&&affectedProductIds.length===0&&now>=Date.parse(meta.cache?.validFrom)&&now<Date.parse(meta.cache?.validUntil)) {
    return {baseRowsWritten:0,affectedProducts:0,changedProjectionRows:0,cache:meta.cache,statements:[],localOnly:true};
  }
  const affected=new Set(affectedProductIds??[]);
  // La caducidad del reloj y los pares de identidad son parte del delta.
  if(!all) {
    for(const row of db.prepare('SELECT product_id FROM search_projection WHERE next_transition<=?').all(new Date(now).toISOString())) affected.add(row.product_id);
    const ids=JSON.stringify([...affected]);
    const keys=db.prepare(`SELECT category,catalog_identity FROM search_projection WHERE product_id IN(SELECT value FROM json_each(?)) UNION SELECT category,catalog_identity FROM products WHERE id IN(SELECT value FROM json_each(?))`).all(ids,ids);
    const peers=db.prepare('SELECT id FROM products WHERE category=? AND catalog_identity=?');
    const previous=db.prepare('SELECT product_id FROM search_projection WHERE category=? AND catalog_identity=?');
    for(const key of keys) {
      for(const row of peers.all(key.category,key.catalog_identity)) affected.add(row.id);
      for(const row of previous.all(key.category,key.catalog_identity)) affected.add(row.product_id);
    }
  }
  const p=validateParams(),base=candidatesSql(p,prepareQuery(''),all?null:[...affected],now);
  const matched=db.prepare(`${base.sql} SELECT * FROM matched`).all(...base.values);
  const offers=db.prepare(`SELECT product_id,observed_at FROM price_basis WHERE kind='current' AND price>0 ${all?'':'AND product_id IN(SELECT value FROM json_each(?))'}`).all(...(all?[]:[JSON.stringify([...affected])]));
  const nextById=new Map();
  const transition=(id,time)=>{if(Number.isFinite(time)&&time>now)nextById.set(id,Math.min(time,nextById.get(id)??Infinity));};
  for(const row of offers) {
    const time=Date.parse(row.observed_at);
    transition(row.product_id,time-60000); // tolerancia de fecha futura
    transition(row.product_id,time+14400000+1); // boost de relevancia: >=
    transition(row.product_id,time+86400000+1); // frescura: BETWEEN inclusivo
  }
  const cached=db.prepare(`SELECT product_id,comparable_valid_until FROM summaries WHERE comparable_stats_json IS NOT NULL ${all?'':'AND product_id IN(SELECT value FROM json_each(?))'}`).all(...(all?[]:[JSON.stringify([...affected])]));
  for(const row of cached) transition(row.product_id,Date.parse(row.comparable_valid_until));
  const preferred=db.prepare(`SELECT p.id FROM products p JOIN summaries s ON s.product_id=p.id WHERE p.catalog_component=1 AND p.category=? AND p.catalog_identity=? ORDER BY p.grouped_identity DESC,p.last_scraped_at DESC,p.updated_at DESC,p.id LIMIT 1`);
  const old=db.prepare('SELECT * FROM search_projection WHERE product_id=?');
  const insertSql=`INSERT INTO search_projection(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`;
  const statements=[];let baseRowsWritten=0;
  const record=(sql,values)=>statements.push({sql,values});
  const kept=new Set();
  for(const row of matched) {
    kept.add(row.id);
    const candidate={product_id:row.id,category:row.category,catalog_identity:row.catalog_identity,canonical:Number(preferred.get(row.category,row.catalog_identity)?.id===row.id),lowest:row.lowest,highest:row.highest,average:row.average,available:row.available,comparable_available:row.comparable_available,urls:row.urls,observed_at:row.observed_at,next_transition:nextById.has(row.id)?new Date(nextById.get(row.id)).toISOString():farFuture};
    const prior=old.get(row.id);
    if(!isDeepStrictEqual({...prior},candidate)) {
      const changed=prior?columns.slice(1).filter(c=>!isDeepStrictEqual(prior[c],candidate[c])):columns;
      const sql=prior?`UPDATE search_projection SET ${changed.map(c=>c+'=?').join(',')} WHERE product_id=?`:insertSql;
      const values=prior?[...changed.map(c=>candidate[c]),row.id]:columns.map(c=>candidate[c]);
      db.prepare(sql).run(...values);record(sql,values);statements.at(-1).changedColumns=changed;statements.at(-1).kind=prior?'update':'insert';baseRowsWritten++;
    }
  }
  const previousIds=all?db.prepare('SELECT product_id FROM search_projection').all():[...affected].map(product_id=>({product_id}));
  for(const row of previousIds) if(!kept.has(row.product_id)) {
    const result=db.prepare('DELETE FROM search_projection WHERE product_id=?').run(row.product_id);
    if(result.changes) {record('DELETE FROM search_projection WHERE product_id=?',[row.product_id]);statements.at(-1).changedColumns=columns;statements.at(-1).kind='delete';baseRowsWritten++;}
  }
  const next=db.prepare('SELECT MIN(next_transition) AS time FROM search_projection').get().time??farFuture;
  const cache={version:1,generation:`${generation}:${now}`,validFrom:new Date(now).toISOString(),validUntil:next};
  const value=JSON.stringify({...meta,projectionVersion:1,cache});
  db.prepare("UPDATE pilot_meta SET value=? WHERE key='snapshot'").run(value);
  record("UPDATE pilot_meta SET value=? WHERE key='snapshot'",[value]);baseRowsWritten++;
  return {baseRowsWritten,affectedProducts:all?matched.length:affected.size,changedProjectionRows:baseRowsWritten-1,cache,statements,localOnly:true};
}
