import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { applyRemoteSync, validateSync } from './remote-sync.mjs';
function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('./projection.sql',import.meta.url),'utf8'));
  db.exec("INSERT INTO products VALUES('p','procesadores','cpu','ryzen','ryzen',1,0,NULL,NULL,'{}'); INSERT INTO product_prices VALUES('o','p','dinobyte',100,'https://dinobyte.ar/producto/cpu/','{}');");
  const expectedSnapshot = JSON.stringify({ projectionVersion:1, cache:{version:1,generation:'old',validFrom:'2026-10-11T14:00:00Z',validUntil:'2026-10-11T15:00:00Z'} });
  db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('snapshot',expectedSnapshot);
  const input = { expectedSnapshot, finalSnapshot:JSON.stringify({projectionVersion:1,cache:{version:1,generation:'new',validFrom:'2026-10-11T14:00:00Z',validUntil:'2026-10-11T15:00:00Z'}}), basisProductIds:['p'], product_prices:[{id:'o',product_id:'p',store_id:'dinobyte',price:120,url:'https://dinobyte.ar/producto/cpu/',row_json:'{}'}], summaries:[], search_projection:[], price_basis:[{product_id:'p',kind:'current',id:'o',store_id:'dinobyte',price:120,stock:'in-stock',url:'https://dinobyte.ar/producto/cpu/',observed_at:'2026-10-11T14:00:00Z'}] };
  input.product_prices[0].row_json=JSON.stringify({...input.product_prices[0],stock:'in-stock',last_updated:'2026-10-11T14:00:00Z'});
  const binding = { prepare(sql) {return {bind(...values) {return {sql,values};}};}, async batch(statements) {db.exec('BEGIN');try {const results=statements.map(s=>{const result=db.prepare(s.sql).run(...s.values);return {success:true,meta:{rows_written:Number(result.changes),rows_read:0}};});db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}} };
  return { db, binding, input };
}
test('dato observado y nueva generación se confirman juntos', async () => {
  const {db,binding,input}=fixture();try {const r=await applyRemoteSync(binding,input);assert.equal(r.atomic,true);assert.equal(db.prepare('SELECT price FROM product_prices').get().price,120);assert.equal(db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get().value,input.finalSnapshot);assert.equal(db.prepare('SELECT count(*) AS n FROM pilot_sync_guard').get().n,0);}finally{db.close();}
});
test('generación obsoleta o error posterior revierte todas las mutaciones', async () => {
  for(const conflict of ['marker','foreign-key']) {
    const {db,binding,input}=fixture();try {const before=input.expectedSnapshot;
      if(conflict==='marker')input.expectedSnapshot=JSON.stringify({cache:{generation:'older'}});else input.product_prices[0].product_id='nonexistent';
      if(conflict==='foreign-key') {input.basisProductIds.push('nonexistent');const raw=JSON.parse(input.product_prices[0].row_json);raw.product_id='nonexistent';input.product_prices[0].row_json=JSON.stringify(raw);input.price_basis[0].product_id='nonexistent';}
      await assert.rejects(applyRemoteSync(binding,input),conflict==='foreign-key'?/FOREIGN KEY/:/CHECK/);
      assert.equal(db.prepare('SELECT price FROM product_prices').get().price,100);
      assert.equal(db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get().value,before);
    }finally{db.close();}
  }
});
test('no acepta SQL libre ni stock desconocido en la base actual', () => {
  const {db,input}=fixture();try {input.price_basis[0].stock='unknown';assert.throws(()=>validateSync(input),/PILOT_SYNC_BASIS/);input.price_basis[0].stock='in-stock';input.product_prices[0].sql='DROP TABLE products';assert.throws(()=>validateSync(input),/PILOT_SYNC_ROW/);}finally{db.close();}
});
test('modificar metadata sin cambiar generación no puede reutilizar una caché anterior', async () => {
  const {db,input}=fixture();try {
    const marker=JSON.parse(input.finalSnapshot); marker.cache.generation='old'; marker.cache.validUntil='2026-10-11T15:01:00Z';input.finalSnapshot=JSON.stringify(marker);
    await assert.rejects(applyRemoteSync({batch(){assert.fail('no debe tocar D1');}},input),/PILOT_SYNC_PROJECTION/);
    marker.cache.generation='';input.finalSnapshot=JSON.stringify(marker);assert.throws(()=>validateSync(input),/PILOT_SYNC_PROJECTION/);
  }finally{db.close();}
});
test('tipos, JSON y base actual incoherentes se rechazan antes de escribir', async () => {
  for(const mutate of [p=>p.product_prices[0].price='bad-price',p=>p.product_prices[0].row_json='not-json',p=>p.price_basis[0].price='bad-price',p=>p.price_basis[0].observed_at='not-date',p=>p.price_basis[0].price=130]) {
    const {db,input}=fixture();try {mutate(input);await assert.rejects(applyRemoteSync({batch(){assert.fail('no debe tocar D1');}},input));assert.equal(db.prepare('SELECT price FROM product_prices').get().price,100);}finally{db.close();}
  }
});
test('la base actual no puede contradecir una oferta remota no modificada', async () => {
  const {db,binding,input}=fixture();try {
    input.product_prices=[];
    await assert.rejects(applyRemoteSync(binding,input),/CHECK/);
    assert.equal(db.prepare('SELECT price FROM product_prices').get().price,100);
    assert.equal(db.prepare('SELECT count(*) AS n FROM price_basis').get().n,0);
    assert.equal(db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get().value,input.expectedSnapshot);
  }finally{db.close();}
});
