import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeRefreshDemand, enqueueKnownProducts, claimRefreshBatch, acknowledgeRefresh, shareRefreshPauses } from './refresh-demand.mjs';
const now = Date.parse('2026-10-11T12:00:00Z');
function fixture(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec('CREATE TABLE products(id TEXT PRIMARY KEY); CREATE TABLE product_prices(id TEXT PRIMARY KEY,product_id TEXT,store_id TEXT,price REAL,url TEXT,row_json TEXT);');
  initializeRefreshDemand(db);
  const add = (id, { observed = now - 2 * 86400000, stock = 'in-stock', url = 'https://shop.example/' + id, productId = 'p' } = {}) => {
    db.prepare('INSERT OR IGNORE INTO products VALUES(?)').run(productId);
    const raw = { id, product_id: productId, store_id: 'shop', price: 100, stock, url, last_updated: observed === null ? null : new Date(observed).toISOString() };
    db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run(id,productId,'shop',100,url,JSON.stringify(raw)); return raw;
  };
  const observe = (id, time, stock = 'in-stock') => {
    const raw = JSON.parse(db.prepare('SELECT row_json FROM product_prices WHERE id=?').get(id).row_json);
    raw.last_updated = new Date(time).toISOString(); raw.stock = stock;
    db.prepare('UPDATE product_prices SET row_json=? WHERE id=?').run(JSON.stringify(raw),id); return raw;
  };
  const enqueue = options => enqueueKnownProducts(db,{productIds:['p'],now,...options});
  const claim = options => claimRefreshBatch(db,{now,...options});
  const receipt = (raw, overrides = {}) => ({ offerId: raw.id, url: raw.url, observedAt: raw.last_updated, source: 'public-page',
    persisted:true,identityVerified:true,priceVerified:true,stockVerified:true,comparableVerified:true,...overrides });
  return { db, add, observe, enqueue, claim, receipt };
}
test('demanda repetida coalesce y sólo encola ofertas conocidas sin tocar la frescura', () => {
  const f=fixture(); const raw=f.add('a'); const before=f.db.prepare('SELECT * FROM product_prices').get();
  assert.equal(f.enqueue().inserted,1);assert.equal(f.enqueue({now:now+5000}).coalesced,1);
  assert.equal(f.enqueue({productIds:['unknown']}).inserted,0);
  assert.deepEqual(f.db.prepare('SELECT * FROM product_prices').get(),before);
  assert.equal(f.claim()[0].observedAt,raw.last_updated); f.db.close();
});
test('oferta reciente espera hasta ventana de actualización y admite regla de guía de tres horas', () => {
  const f=fixture();f.add('a',{observed:now-3600000});f.enqueue({freshMs:3*3600000,refreshAheadMs:1800000});
  assert.equal(f.claim().length,0);assert.equal(f.claim({now:now+90*60000-1}).length,0);
  assert.equal(f.claim({now:now+90*60000}).length,1);f.db.close();
});
test('lease durable excluye otro consumidor y se recupera tras vencimiento', () => {
  const dir=mkdtempSync(join(tmpdir(),'catalog-queue-'));const path=join(dir,'catalog.sqlite');const f=fixture(path);f.add('a');f.enqueue();
  const first=f.claim({leaseMs:1000})[0];const peer=new DatabaseSync(path);
  assert.equal(claimRefreshBatch(peer,{now:now+1}).length,0);
  const second=claimRefreshBatch(peer,{now:now+1000})[0];assert.notEqual(second.leaseToken,first.leaseToken);
  assert.throws(()=>acknowledgeRefresh(f.db,{offerId:'a',leaseToken:first.leaseToken,now:now+1001,outcome:'network-error'}),/LEASE_CONFLICT/);
  peer.close();f.db.close();rmSync(dir,{recursive:true});
});
test('429 aplica retry-after y búsquedas adicionales no lo saltean ni renuevan fecha', () => {
  const f=fixture();f.add('a');const before=f.db.prepare('SELECT row_json FROM product_prices').get().row_json;f.enqueue();
  const claim=f.claim()[0];const failed=acknowledgeRefresh(f.db,{...claim,now:now+1,outcome:'http-429',retryAfterMs:3600000});
  assert.equal(failed.dueAt,now+6*3600000+1);f.enqueue({now:now+60001});assert.equal(f.claim({now:now+60002}).length,0);
  assert.equal(f.claim({now:failed.dueAt}).length,1);assert.equal(f.db.prepare('SELECT row_json FROM product_prices').get().row_json,before);f.db.close();
});
test('fallos reiterados duplican backoff y conservan observación real', () => {
  const f=fixture();const raw=f.add('a');f.enqueue();let claim=f.claim()[0];
  let failed=acknowledgeRefresh(f.db,{...claim,now:now+1,outcome:'no-observation'});assert.equal(failed.dueAt,now+30001);assert.equal(failed.observedAt,raw.last_updated);
  claim=f.claim({now:failed.dueAt})[0];failed=acknowledgeRefresh(f.db,{...claim,now:failed.dueAt+1,outcome:'http-403'});assert.equal(failed.dueAt,now+30002+6*3600000);f.db.close();
});
test('ACK observado exige evidencia y persistencia externa posterior al intento', () => {
  const f=fixture();const raw=f.add('a');f.enqueue();const claim=f.claim()[0];
  assert.throws(()=>acknowledgeRefresh(f.db,{...claim,now:now+2,outcome:'observed',receipt:f.receipt(raw)}),/NOT_PERSISTED/);
  const refreshed=f.observe('a',now+1);const result=acknowledgeRefresh(f.db,{...claim,now:now+2,outcome:'observed',receipt:f.receipt(refreshed)});
  assert.equal(result.comparable,true);assert.equal(result.observedAt,refreshed.last_updated);assert.equal(f.claim({now:now+3}).length,0);f.db.close();
});
test('stock unknown/backorder observado no se convierte en oferta comparable', () => {
  for(const stock of ['unknown','available-on-backorder','out-of-stock']) {
    const f=fixture();f.add('a');f.enqueue();const claim=f.claim()[0];const raw=f.observe('a',now+1,stock);
    assert.equal(acknowledgeRefresh(f.db,{...claim,now:now+2,outcome:'observed',receipt:f.receipt(raw)}).comparable,false);f.db.close();
  }
});
test('persistencia o identidad sin verificar rechaza ACK sin cerrar lease', () => {
  const f=fixture();f.add('a');f.enqueue();const claim=f.claim()[0];const raw=f.observe('a',now+1);
  for(const key of ['persisted','identityVerified','stockVerified','priceVerified']) {
    assert.throws(()=>acknowledgeRefresh(f.db,{...claim,now:now+2,outcome:'observed',receipt:f.receipt(raw,{[key]:false})}),/NOT_PERSISTED/);
  }
  assert.equal(f.db.prepare('SELECT status FROM pilot_refresh_demand').get().status,'leased');f.db.close();
});
test('demanda vencida no se ejecuta y una búsqueda posterior la reactiva', () => {
  const f=fixture();f.add('a');f.enqueue({demandTtlMs:86400000});assert.equal(f.claim({now:now+86400000}).length,0);
  assert.equal(f.enqueue({now:now+86400001}).updated,1);assert.equal(f.claim({now:now+86400001}).length,1);f.db.close();
});
test('URL cambiada mientras esperaba no se refresca ni se reasigna por similitud', () => {
  const f=fixture();f.add('a');f.enqueue();const raw=JSON.parse(f.db.prepare('SELECT row_json FROM product_prices').get().row_json);raw.url='https://other.example/a';
  f.db.prepare('UPDATE product_prices SET url=?,row_json=?').run(raw.url,JSON.stringify(raw));
  assert.equal(f.claim().length,0);assert.equal(f.db.prepare('SELECT status FROM pilot_refresh_demand').get().status,'expired');f.db.close();
});
test('cantidad de demanda y lote quedan acotados; rechaza esquemas y relojes inválidos', () => {
  const f=fixture();f.add('a',{url:'file:///tmp/a'});assert.equal(f.enqueue().rejected,1);
  assert.throws(()=>f.enqueue({productIds:Array(21).fill('p')}),/INVALID_PRODUCTS/);assert.throws(()=>f.claim({limit:26}),/INVALID_BATCH/);
  assert.throws(()=>f.enqueue({now:NaN}),/INVALID_CLOCK/);f.db.close();
});
test('demanda con reloj hacia atrás falla y revierte el cambio', () => {
  const f=fixture();f.add('a');f.enqueue();assert.throws(()=>f.enqueue({now:now-1}),/CLOCK_REGRESSION/);
  assert.equal(f.db.prepare('SELECT requested_at FROM pilot_refresh_demand').get().requested_at,now);f.db.close();
});
test('allowlist opcional conserva default, filtra antes del lote y lista vacía no demanda ni reserva', () => {
  const f=fixture();f.add('a');f.add('b');
  const b=JSON.parse(f.db.prepare("SELECT row_json FROM product_prices WHERE id='b'").get().row_json);b.store_id='other';
  f.db.prepare("UPDATE product_prices SET store_id='other',row_json=? WHERE id='b'").run(JSON.stringify(b));
  assert.equal(f.enqueue({storeIds:[]}).inserted,0);assert.equal(f.enqueue({storeIds:['other']}).inserted,1);
  assert.equal(f.enqueue().inserted,1);assert.equal(f.claim({storeIds:[]}).length,0);
  assert.equal(f.claim({storeIds:['other']})[0].offerId,'b');assert.equal(f.claim()[0].offerId,'a');
  assert.throws(()=>f.enqueue({storeIds:'shop'}),/INVALID_STORES/);assert.throws(()=>f.claim({storeIds:['bad:store']}),/INVALID_STORES/);f.db.close();
});
test('demanda de 24h nunca posterga pendiente 3h y 3h adelanta inmediatamente aunque coaleszca', () => {
  const f=fixture();f.add('a',{observed:now-3600000});f.enqueue({freshMs:3*3600000,refreshAheadMs:1800000});
  const early=f.db.prepare('SELECT due_at FROM pilot_refresh_demand').get().due_at;
  f.enqueue({now:now+60001,freshMs:86400000,refreshAheadMs:5400000});
  assert.equal(f.db.prepare('SELECT due_at FROM pilot_refresh_demand').get().due_at,early);f.db.close();
  const g=fixture();g.add('a',{observed:now-3600000});g.enqueue();
  assert.equal(g.enqueue({now:now+1,freshMs:3*3600000,refreshAheadMs:1800000}).updated,1);
  assert.equal(g.db.prepare('SELECT due_at FROM pilot_refresh_demand').get().due_at,early);g.db.close();
});

test('producto solicitado filtra antes de prioridad/límite y no reserva pendiente ajena', () => {
  const f=fixture();f.add('requested');f.add('outside',{productId:'outside-p'});
  f.enqueue({productIds:['p','outside-p']});
  f.db.prepare("UPDATE pilot_refresh_demand SET priority=200 WHERE offer_id='outside'").run();
  const outside=f.db.prepare("SELECT * FROM pilot_refresh_demand WHERE offer_id='outside'").get();
  assert.deepEqual(f.claim({productIds:[],limit:1}),[]);
  assert.deepEqual(f.claim({productIds:['p'],storeIds:['other'],limit:1}),[]);
  const claims=f.claim({productIds:['p','p'],storeIds:['shop'],limit:1});
  assert.equal(claims.length,1);assert.equal(claims[0].offerId,'requested');
  assert.deepEqual(f.db.prepare("SELECT * FROM pilot_refresh_demand WHERE offer_id='outside'").get(),outside);
  // Omitir el filtro conserva el contrato anterior de consumidor general.
  assert.equal(f.claim()[0].offerId,'outside');f.db.close();
});
test('filtro de productos inválido no toca leases ni cola', () => {
  const f=fixture();f.add('a');f.enqueue();const before=f.db.prepare('SELECT * FROM pilot_refresh_demand').all();
  for(const productIds of ['p',null,[''],[1],Array(21).fill('p'),['p'.repeat(201)]])
    assert.throws(()=>f.claim({productIds}),/INVALID_PRODUCTS/);
  assert.deepEqual(f.db.prepare('SELECT * FROM pilot_refresh_demand').all(),before);f.db.close();
});
test('offerIds filtra antes del tope100 y no encola otras ofertas del mismo producto',()=>{
  const f=fixture();for(let i=0;i<105;i++)f.add(String(i).padStart(3,'0'));
  assert.equal(f.enqueue({offerIds:['104']}).inserted,1);
  assert.deepEqual(f.db.prepare('SELECT offer_id FROM pilot_refresh_demand').all().map(r=>r.offer_id),['104']);
  assert.equal(f.enqueue({offerIds:[]}).inserted,0);
  for(const offerIds of ['104',null,[''],Array(101).fill('104')])assert.throws(()=>f.enqueue({offerIds}),/INVALID_OFFERS/);
  f.add('null');f.db.prepare("UPDATE product_prices SET row_json='null' WHERE id='null'").run();
  assert.equal(f.enqueue({offerIds:['null']}).rejected,1);f.db.close();
});
test('encolado admite transacción externa explícita y rollback revierte todas las ofertas',()=>{
  const f=fixture();f.add('a');assert.throws(()=>f.enqueue({withinTransaction:true}),/TRANSACTION_REQUIRED/);
  f.db.exec('BEGIN IMMEDIATE');assert.equal(f.enqueue({withinTransaction:true,offerIds:['a']}).inserted,1);
  f.db.exec('ROLLBACK');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM pilot_refresh_demand').get().n,0);f.db.close();
});
test('las copias comparten la pausa máxima y otra reclamación no la saltea',()=>{
  const a=fixture(),b=fixture();a.add('a');b.add('a');a.enqueue();b.enqueue();
  a.db.prepare('INSERT INTO pilot_cycle_store_pause VALUES(?,?,?)').run('shop',now+6*3600000,'http-403');
  b.db.prepare('INSERT INTO pilot_cycle_store_pause VALUES(?,?,?)').run('shop',now+9*3600000,'http-429');
  const raw=a.db.prepare('SELECT row_json FROM product_prices').get().row_json;
  const result=shareRefreshPauses([a.db,b.db],{now});assert.equal(result.writes,1);
  assert.deepEqual({...a.db.prepare('SELECT * FROM pilot_cycle_store_pause').get()},{store_id:'shop',until_at:now+9*3600000,reason:'http-429'});
  assert.equal(a.claim().length,0);assert.equal(b.claim().length,0);
  assert.equal(shareRefreshPauses([a.db,b.db],{now}).writes,0);
  assert.equal(a.db.prepare('SELECT row_json FROM product_prices').get().row_json,raw);a.db.close();b.db.close();
});
test('una pausa inválida se rechaza antes de escribir cualquier copia; vencida no se propaga',()=>{
  const a=fixture(),b=fixture();
  a.db.prepare('INSERT INTO pilot_cycle_store_pause VALUES(?,?,?)').run('shop',now+6*3600000,'http-403');
  b.db.prepare('INSERT INTO pilot_cycle_store_pause VALUES(?,?,?)').run('bad',now+25*3600000,'http-403');
  assert.throws(()=>shareRefreshPauses([a.db,b.db],{now}),/PAUSE_ROW/);
  assert.equal(b.db.prepare("SELECT COUNT(*) n FROM pilot_cycle_store_pause WHERE store_id='shop'").get().n,0);
  b.db.exec('DELETE FROM pilot_cycle_store_pause');
  assert.equal(shareRefreshPauses([a.db,b.db],{now:now+6*3600000}).stores,0);
  assert.equal(b.db.prepare('SELECT COUNT(*) n FROM pilot_cycle_store_pause').get().n,0);
  assert.throws(()=>shareRefreshPauses([a.db,a.db],{now}),/DATABASES/);a.db.close();b.db.close();
});
