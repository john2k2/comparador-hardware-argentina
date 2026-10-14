import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {buildClockSyncDelta,validateClockSync,applyClockSync} from './clock-sync.mjs';
const now=Date.parse('2026-10-12T05:00:00Z'),next='2026-10-12T06:00:00.000Z',options={now,maxRowsWritten:10000};
function fixture(count=2){
  const before=new DatabaseSync(':memory:'),after=new DatabaseSync(':memory:');
  const old=JSON.stringify({projectionVersion:1,counts:{products:count},catalog:{fingerprint:'immutable'},cache:{version:1,generation:'old',validFrom:'2026-10-12T04:00:00.000Z',validUntil:'2026-10-12T05:00:00.000Z'}});
  const final=JSON.stringify({...JSON.parse(old),cache:{version:1,generation:'new',validFrom:new Date(now).toISOString(),validUntil:next}});
  for(const db of [before,after]){
    db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));db.exec(readFileSync(new URL('./projection.sql',import.meta.url),'utf8'));
    db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('snapshot',old);
    const product=db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?)'),projection=db.prepare('INSERT INTO search_projection VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
    for(let i=0;i<count;i++){const id='p'+i;product.run(id,'procesadores','cpu'+i,'ryzen','ryzen',1,0,null,null,'{}');
      projection.run(id,'procesadores','cpu'+i,1,100,100,100,1,1,'https://example.com/p'+i,'2026-10-11T20:00:00.000Z','2026-10-12T05:00:00.000Z');}
    db.exec("INSERT INTO stores VALUES('store','{}');INSERT INTO product_prices VALUES('offer','p0','store',100,'https://example.com/p0','{\"last_updated\":\"2026-10-11T20:00:00Z\"}');INSERT INTO price_basis VALUES('p0','current','offer','store',100,'in-stock','https://example.com/p0','2026-10-11T20:00:00Z');INSERT INTO summaries VALUES('p0',100,100,100,1,'https://example.com/p0',0,'[\"store\"]',NULL,NULL,NULL,'{}');");
  }
  after.prepare("UPDATE search_projection SET lowest=NULL,highest=NULL,average=NULL,available=0,comparable_available=0,urls=NULL,observed_at=NULL,next_transition=?").run(next);
  after.prepare("UPDATE pilot_meta SET value=? WHERE key='snapshot'").run(final);
  const binding={prepare(sql){return{bind(...values){return{sql,values};}};},async batch(statements){
    before.exec('BEGIN');try{const result=statements.map(statement=>{const r=before.prepare(statement.sql).run(...statement.values);return{success:true,meta:{changes:Number(r.changes),rows_written:statement.sql.startsWith('CREATE')?0:Number(r.changes),rows_read:0}};});before.exec('COMMIT');return result;}catch(error){before.exec('ROLLBACK');throw error;}
  }};
  return{before,after,old,final,binding,delta:()=>buildClockSyncDelta(before,after,options),close(){before.close();after.close();}};
}
const marker=db=>db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get().value;
const rows=db=>db.prepare('SELECT * FROM search_projection ORDER BY product_id').all();
test('1352 filas vencidas se publican por un batch de siete statements sin renovar observaciones',async()=>{
  const f=fixture(1352);try{const delta=f.delta(),seen=[];assert.equal(delta.rows.length,1352);assert.ok(new TextEncoder().encode(JSON.stringify(delta)).length<=1024*1024);
    const binding={...f.binding,async batch(s){seen.push(...s);return f.binding.batch(s);}};
    const result=await applyClockSync(binding,delta,options);assert.equal(result.atomic,true);assert.equal(result.statements,7);assert.equal(result.applied,true);assert.equal(result.estimatedMaxRowsWritten,5416);
    assert.deepEqual(rows(f.before),rows(f.after));assert.equal(marker(f.before),f.final);assert.equal(f.before.prepare('SELECT price FROM product_prices').get().price,100);assert.equal(f.before.prepare('SELECT observed_at FROM price_basis').get().observed_at,'2026-10-11T20:00:00Z');
    assert.match(seen[2].sql,/UPDATE search_projection AS s SET/);assert.match(seen[2].sql,/FROM json_each\(\?\)/);assert.equal(seen[2].values.length,2);
    assert.equal(f.before.prepare('SELECT COUNT(*) n FROM pilot_clock_sync_guard').get().n,0);
  }finally{f.close();}
});
test('reintento idéntico acredita filas finales y confirma ACK sin reaplicar el reloj',async()=>{
  const f=fixture();try{const delta=f.delta();await applyClockSync(f.binding,delta,options);const result=await applyClockSync(f.binding,delta,options);
    assert.equal(result.applied,false);assert.equal(marker(f.before),f.final);assert.deepEqual(rows(f.before),rows(f.after));
    f.before.exec("UPDATE search_projection SET lowest=7 WHERE product_id='p0'");await assert.rejects(applyClockSync(f.binding,delta,options),/CHECK/);assert.equal(marker(f.before),f.final);
  }finally{f.close();}
});
test('patch next_transition conserva todos los derivados omitidos y NULL explícito se aplica',async()=>{
  const f=fixture();try{
    for(const r of rows(f.before))f.after.prepare('UPDATE search_projection SET lowest=?,highest=?,average=?,available=?,comparable_available=?,urls=?,observed_at=? WHERE product_id=?').run(r.lowest,r.highest,r.average,r.available,r.comparable_available,r.urls,r.observed_at,r.product_id);
    const delta=f.delta();assert.deepEqual(Object.keys(delta.rows[0].after),['next_transition']);
    await applyClockSync(f.binding,delta,options);assert.deepEqual(rows(f.before),rows(f.after));assert.equal(rows(f.before)[0].lowest,100);
    assert.equal((await applyClockSync(f.binding,delta,options)).applied,false);
  }finally{f.close();}
  const nullable=fixture();try{const delta=nullable.delta();assert.equal(delta.rows[0].after.lowest,null);await applyClockSync(nullable.binding,delta,options);assert.equal(rows(nullable.before)[0].lowest,null);}finally{nullable.close();}
});
test('snapshot stale, reloj posterior y filas faltantes/extra/contradictorias se rechazan y conservan datos',async()=>{
  for(const conflict of ['stale','newer','missing','extra','partial']){const f=fixture();try{const delta=f.delta();
    if(conflict==='stale')f.before.prepare("UPDATE pilot_meta SET value=? WHERE key='snapshot'").run('stale');
    if(conflict==='newer')f.before.prepare("UPDATE pilot_meta SET value=? WHERE key='snapshot'").run(JSON.stringify({...JSON.parse(f.final),cache:{...JSON.parse(f.final).cache,generation:'later',validFrom:next,validUntil:'2026-10-12T07:00:00.000Z'}}));
    if(conflict==='missing')f.before.exec("DELETE FROM search_projection WHERE product_id='p1'");
    if(conflict==='extra')f.before.exec("INSERT INTO products SELECT 'extra',category,catalog_identity,catalog_name,catalog_document,catalog_component,grouped_identity,last_scraped_at,updated_at,row_json FROM products WHERE id='p1';INSERT INTO search_projection SELECT 'extra',category,catalog_identity,canonical,lowest,highest,average,available,comparable_available,urls,observed_at,next_transition FROM search_projection WHERE product_id='p1'");
    if(conflict==='partial')f.before.exec("UPDATE search_projection SET category='memoria-ram' WHERE product_id='p1'");
    const oldMarker=marker(f.before),oldRows=rows(f.before);await assert.rejects(applyClockSync(f.binding,delta,options),/CHECK/);assert.equal(marker(f.before),oldMarker);assert.deepEqual(rows(f.before),oldRows);
  }finally{f.close();}}
});
test('error después del UPDATE revierte filas y marcador del batch completo',async()=>{
  const f=fixture();try{const delta=f.delta(),original=rows(f.before);
    const binding={...f.binding,batch(s){s[4]={sql:'INSERT INTO nonexistent VALUES(1)',values:[]};return f.binding.batch(s);}};
    await assert.rejects(applyClockSync(binding,delta,options),/no such table/);assert.deepEqual(rows(f.before),original);assert.equal(marker(f.before),f.old);
  }finally{f.close();}
});
test('guard final rechaza target eliminado durante UPDATE y revierte todo',async()=>{
  const f=fixture();try{const delta=f.delta(),original=rows(f.before);
    f.before.exec("CREATE TRIGGER remove_target AFTER UPDATE ON search_projection WHEN new.product_id='p0' BEGIN DELETE FROM search_projection WHERE product_id='p1';END;");
    await assert.rejects(applyClockSync(f.binding,delta,options),/CHECK/);assert.deepEqual(rows(f.before),original);assert.equal(marker(f.before),f.old);
  }finally{f.close();}
});
test('conteo final rechaza una fila extra añadida por trigger durante el batch',async()=>{
  const f=fixture();try{const delta=f.delta(),original=rows(f.before);
    f.before.exec("INSERT INTO products SELECT 'extra',category,catalog_identity,catalog_name,catalog_document,catalog_component,grouped_identity,last_scraped_at,updated_at,row_json FROM products WHERE id='p1';CREATE TRIGGER add_extra AFTER UPDATE ON search_projection WHEN new.product_id='p0' BEGIN INSERT INTO search_projection SELECT 'extra',category,catalog_identity,canonical,lowest,highest,average,available,comparable_available,urls,observed_at,next_transition FROM search_projection WHERE product_id='p1';END;");
    await assert.rejects(applyClockSync(f.binding,delta,options),/CHECK/);assert.deepEqual(rows(f.before),original);assert.equal(marker(f.before),f.old);
  }finally{f.close();}
});
test('race antes de abrir el batch falla contra el snapshot primario',async()=>{
  const f=fixture();try{const delta=f.delta();const binding={...f.binding,batch(s){f.before.prepare("UPDATE pilot_meta SET value=? WHERE key='snapshot'").run('raced');return f.binding.batch(s);}};
    await assert.rejects(applyClockSync(binding,delta,options),/CHECK/);assert.equal(marker(f.before),'raced');assert.equal(rows(f.before)[0].lowest,100);
  }finally{f.close();}
});
test('no-op verifica tablas y proyección incluso cuando snapshot es idéntico',()=>{
  const f=fixture();try{f.after.prepare("UPDATE pilot_meta SET value=? WHERE key='snapshot'").run(f.old);
    assert.throws(()=>f.delta(),/CLOCK_SYNC_SNAPSHOT/);f.after.prepare('UPDATE search_projection SET lowest=100,highest=100,average=100,available=1,comparable_available=1,urls=?,observed_at=?,next_transition=? WHERE product_id=?').run('https://example.com/p0','2026-10-11T20:00:00.000Z','2026-10-12T05:00:00.000Z','p0');
    f.after.prepare('UPDATE search_projection SET lowest=100,highest=100,average=100,available=1,comparable_available=1,urls=?,observed_at=?,next_transition=? WHERE product_id=?').run('https://example.com/p1','2026-10-11T20:00:00.000Z','2026-10-12T05:00:00.000Z','p1');assert.equal(f.delta(),null);
    f.after.exec("UPDATE product_prices SET price=101");assert.throws(()=>f.delta(),/IMMUTABLE_PRODUCT_PRICES/);
  }finally{f.close();}
});
test('builder rechaza mutaciones de cada tabla inmutable y membresía de proyección',()=>{
  for(const mutation of ["UPDATE products SET row_json='changed'","UPDATE product_prices SET url='https://example.com/changed'","UPDATE summaries SET lowest=101","UPDATE price_basis SET observed_at='2026-10-12T05:00:00Z'","UPDATE stores SET row_json='changed'","DELETE FROM search_projection WHERE product_id='p1'","UPDATE search_projection SET canonical=0 WHERE product_id='p1'","UPDATE search_projection SET catalog_identity='different' WHERE product_id='p1'"]){const f=fixture();try{f.after.exec(mutation);assert.throws(()=>f.delta(),/CLOCK_SYNC_(IMMUTABLE|MEMBERSHIP)/);}finally{f.close();}}
});
test('payload limitado: tipos, IDs únicos, campos, fechas, metadata y presupuesto explícito',async()=>{
  const f=fixture();try{const original=f.delta();
    const mutations=[p=>p.rows.push(p.rows[0]),p=>p.rows[0].after.product_id='other',p=>p.rows[0].after.lowest=Infinity,p=>p.rows[0].after.available=-1,p=>p.rows[0].after.urls=9,p=>p.rows[0].after.observed_at='bad',p=>p.rows[0].after.next_transition='2026-10-12T04:00:00Z',p=>p.rows[0].after.extra=1,p=>p.rows[0].after.category='memoria-ram',p=>p.rows[0].before.product_id='x'.repeat(257),p=>p.expectedProjectionCount=1.5,p=>p.finalSnapshot=JSON.stringify({...JSON.parse(p.finalSnapshot),counts:{products:9}}),p=>p.finalSnapshot=JSON.stringify({...JSON.parse(p.finalSnapshot),cache:{...JSON.parse(p.finalSnapshot).cache,generation:'old'}})];
    for(const mutate of mutations){const p=structuredClone(original);mutate(p);await assert.rejects(applyClockSync({batch(){assert.fail('DB no debe consultarse');}},p,options),/CLOCK_SYNC_/);}
    const getter=structuredClone(original);Object.defineProperty(getter.rows[0].after,'lowest',{enumerable:true,get(){assert.fail('no ejecutar getter');}});assert.throws(()=>validateClockSync(getter,options),/ROW/);
    const custom=structuredClone(original);Object.setPrototypeOf(custom.rows[0].after,{toJSON(){return{};}});assert.throws(()=>validateClockSync(custom,options),/ROW/);
    assert.throws(()=>validateClockSync(original,{now}),/BUDGET/);assert.throws(()=>validateClockSync(original,{now,maxRowsWritten:15}),/BUDGET/);
    assert.throws(()=>validateClockSync(original,{...options,now:now-1}),/CLOCK/);assert.throws(()=>validateClockSync(original,{...options,now:Date.parse(next)}),/CLOCK/);
  }finally{f.close();}
});
test('2001 filas o JSON superior a 1MiB no entran en el transporte',()=>{
  const f=fixture(2001);try{assert.throws(()=>f.delta(),/PAYLOAD/);}finally{f.close();}
  const small=fixture(60);try{const payload=small.delta();for(const r of payload.rows){r.before.urls='x'.repeat(10000);r.after.urls='y'.repeat(10000);}assert.throws(()=>validateClockSync(payload,options),/SIZE/);}finally{small.close();}
});
test('horizonte final incorrecto falla builder y runtime con rollback',async()=>{
  const f=fixture();try{const payload=f.delta();payload.finalSnapshot=JSON.stringify({...JSON.parse(payload.finalSnapshot),cache:{...JSON.parse(payload.finalSnapshot).cache,validUntil:'2026-10-12T07:00:00.000Z'}});
    f.after.prepare("UPDATE pilot_meta SET value=? WHERE key='snapshot'").run(payload.finalSnapshot);assert.throws(()=>f.delta(),/HORIZON/);
    await assert.rejects(applyClockSync(f.binding,payload,options),/CHECK/);assert.equal(marker(f.before),f.old);assert.equal(rows(f.before)[0].lowest,100);
  }finally{f.close();}
});
test('ACK final no admite conteo alterado ni reloj anterior',async()=>{
  const f=fixture();try{const payload=f.delta();await applyClockSync(f.binding,payload,options);f.before.exec("DELETE FROM search_projection WHERE product_id='p1'");await assert.rejects(applyClockSync(f.binding,payload,options),/CHECK/);
    const reverse={...payload,expectedSnapshot:payload.finalSnapshot,finalSnapshot:payload.expectedSnapshot,rows:payload.rows.map(c=>({before:c.after,after:c.before}))};assert.throws(()=>validateClockSync(reverse,options),/CLOCK/);
  }finally{f.close();}
});
