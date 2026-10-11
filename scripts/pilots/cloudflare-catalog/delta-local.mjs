import { DatabaseSync } from 'node:sqlite';
import { createReadStream,existsSync,writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { verifySnapshot } from './snapshot-verify.mjs';
const iso=value=>value?new Date(value).toISOString():null;
const valueSql=value=>value===null?'NULL':typeof value==='number'?String(value):`'${String(value).replaceAll("'","''")}'`;
async function summaries(source) {
  const map=new Map();for await(const line of createInterface({input:createReadStream(join(source,'catalog_price_summaries.jsonl')),crlfDelay:Infinity}))if(line){const row=JSON.parse(line);map.set(row.product_id,{row,line});}return map;
}
export async function applyCertifiedDelta({before,after,sqlite,sqlFile}) {
  if(existsSync(sqlFile)) throw new Error('SQL output exists');
  const oldManifest=await verifySnapshot(before),newManifest=await verifySnapshot(after);
  for(const table of ['stores','products','product_prices']) {
    if(oldManifest.tables.find(t=>t.table===table).sha256!==newManifest.tables.find(t=>t.table===table).sha256)throw new Error(`This narrow delta cannot change ${table}`);
  }
  const oldRows=await summaries(before),newRows=await summaries(after);
  if(oldRows.size!==newRows.size)throw new Error('This narrow delta cannot add/remove summaries');
  const db=new DatabaseSync(sqlite),sql=[];let changed=0,rowsWritten=0;
  function statement(query,values) {db.prepare(query).run(...values);let index=0;sql.push(query.replaceAll('?',()=>valueSql(values[index++]))+';');}
  try {
    db.exec('BEGIN');
    for(const [id,{row,line}]of newRows){
      if(!oldRows.has(id))throw new Error('Changed summary identity');
      if(oldRows.get(id).line===line)continue;
      const a={...oldRows.get(id).row},b={...row};for(const key of ['comparable_offers','comparable_stats','comparable_valid_until','comparable_latest_observed_at','comparable_initialized']){delete a[key];delete b[key];}
      if(!isDeepStrictEqual(a,b))throw new Error('Narrow delta cannot alter historical statistics');
      rowsWritten+=Number(db.prepare("SELECT COUNT(*) n FROM price_basis WHERE product_id=? AND kind='current'").get(id).n);
      statement("DELETE FROM price_basis WHERE product_id=? AND kind='current'",[id]);
      for(const offer of row.comparable_offers??[]) {statement('INSERT INTO price_basis(product_id,kind,id,store_id,price,stock,url,observed_at) VALUES(?,?,?,?,?,?,?,?)',[id,'current',offer.id,offer.store_id,Number(offer.price),offer.stock??null,offer.url??null,iso(offer.last_updated)]);rowsWritten++;}
      statement('UPDATE summaries SET comparable_stats_json=?,comparable_valid_until=?,comparable_latest_observed_at=? WHERE product_id=?',[row.comparable_stats?JSON.stringify(row.comparable_stats):null,iso(row.comparable_valid_until),iso(row.comparable_latest_observed_at),id]);rowsWritten++;changed++;
    }
    const hashes=Object.fromEntries(newManifest.tables.map(t=>[t.table,t.sha256])),counts=Object.fromEntries(newManifest.tables.map(t=>[t.table,t.count]));
    statement('UPDATE pilot_meta SET value=? WHERE key=?',[JSON.stringify({counts,hashes}),'snapshot']);rowsWritten++;
    db.exec('COMMIT');db.close();writeFileSync(sqlFile,sql.join('\n')+'\n');
    return {changedSummaries:changed,baseRowsWritten:rowsWritten,sqlFile,localOnly:true,note:'No modifica precios/historial originales. Conteo excluye escrituras de índices.'};
  }catch(error){try{db.exec('ROLLBACK');db.close();}catch{}throw error;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [before,after,sqlite,sqlFile]=process.argv.slice(2);
  if(!sqlFile)throw new Error('Usage: delta-local.mjs BEFORE_SNAPSHOT CERTIFIED_SNAPSHOT SQLITE NEW_SQL_FILE');
  console.log(JSON.stringify(await applyCertifiedDelta({before,after,sqlite,sqlFile}),null,2));
}
