import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeRotation,seedNextRotationBatch,coverageSnapshot } from './rotation-local.mjs';
import { enqueueKnownProducts,claimRefreshBatch,acknowledgeRefresh } from './refresh-demand.mjs';
const now=Date.parse('2026-10-11T15:00:00Z'),DAY=86400000;
const capabilities={storeIds:['shop'],categories:['procesadores','memoria-ram'],validatorTarget:(_id,url)=>url.startsWith('https://shop.example/')};
function fixture(file=':memory:') {
  const db=new DatabaseSync(file);
  db.exec(`CREATE TABLE products(id TEXT PRIMARY KEY,category TEXT,row_json TEXT);CREATE TABLE product_prices(id TEXT PRIMARY KEY,product_id TEXT,store_id TEXT,price REAL,url TEXT,row_json TEXT);
    CREATE TABLE price_basis(product_id TEXT,kind TEXT,id TEXT,store_id TEXT,price REAL,stock TEXT,url TEXT,observed_at TEXT);`);
  initializeRotation(db);
  const add=(id,{productId='p',storeId='shop',category='procesadores',observed=now-2*DAY,stock='in-stock',url=`https://shop.example/${id}`}={})=>{
    db.prepare('INSERT OR IGNORE INTO products VALUES(?,?,?)').run(productId,category,JSON.stringify({id:productId,name:`Product ${productId}`}));
    const raw={id,product_id:productId,store_id:storeId,price:100,stock,url,last_updated:observed===null?null:new Date(observed).toISOString()};
    db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run(id,productId,storeId,100,url,JSON.stringify(raw));return raw;
  };
  const seed=options=>seedNextRotationBatch(db,{now,capabilities,clock:()=>options?.now??now,...options});
  const coverage=options=>coverageSnapshot(db,{now,capabilities,...options});
  return {db,add,seed,coverage};
}
function finish(db,time=now) {
  const reports=[];
  for(let i=0;i<30;i++){const result=seedNextRotationBatch(db,{now:time,capabilities,clock:()=>time});reports.push(result);if(result.complete)return reports;}
  throw new Error('TEST_CURSOR_DID_NOT_TERMINATE');
}
test('tres pasadas cubren >100 ofertas del mismo producto, sin reencolar cada tick ni renovar fecha',()=>{
  const f=fixture();for(let i=0;i<235;i++)f.add(String(i).padStart(4,'0'));
  const prices=f.db.prepare('SELECT * FROM product_prices').all();
  for(let pass=0;pass<3;pass++) {
    const time=now+pass*DAY,reports=finish(f.db,time);
    assert.equal(reports.reduce((n,r)=>n+r.examined,0),235);assert.equal(reports.at(-1).pass,pass+1);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM pilot_refresh_demand').get().n,235);
    const queue=f.db.prepare('SELECT * FROM pilot_refresh_demand').all();
    assert.equal(f.seed({now:time+60000}).status,'waiting');
    assert.deepEqual(f.db.prepare('SELECT * FROM pilot_refresh_demand').all(),queue);
  }
  assert.deepEqual(f.db.prepare('SELECT * FROM product_prices').all(),prices);f.db.close();
});
test('reinicio recupera cursor; 20 IDs por transacción no dejan ofertas sin programar',()=>{
  const dir=mkdtempSync(join(tmpdir(),'catalog-rotation-')),file=join(dir,'sample.sqlite');const f=fixture(file);
  try {
    for(let i=0;i<65;i++)f.add(String(i).padStart(3,'0'),{productId:`p${i}`});
    const first=f.seed();assert.equal(first.examined,20);assert.equal(first.productIds.length,20);assert.equal(first.complete,false);f.db.close();
    const resumed=new DatabaseSync(file);
    try{initializeRotation(resumed);const reports=finish(resumed);assert.equal(reports[0].cursor,'039');assert.equal(reports.at(-1).pass,1);
      assert.equal(resumed.prepare('SELECT COUNT(*) n FROM pilot_refresh_demand').get().n,65);}
    finally{resumed.close();}
  }finally{rmSync(dir,{recursive:true});}
});
test('capacidad por categoría/URL conserva todo el denominador y no encola hermanos no soportados',()=>{
  const f=fixture();f.add('a');f.add('b',{productId:'gpu',category:'tarjetas-graficas'});f.add('c',{storeId:'other'});
  f.add('d',{url:'https://invalid.example/d'});f.add('e');f.db.prepare("UPDATE product_prices SET row_json='null' WHERE id='e'").run();
  const result=f.seed();assert.equal(result.examined,5);assert.equal(result.supported,1);assert.equal(result.unsupported,3);assert.equal(result.rejected,1);
  assert.deepEqual(f.db.prepare('SELECT offer_id FROM pilot_refresh_demand').all().map(r=>r.offer_id),['a']);
  const stats=f.coverage();assert.equal(stats.totals.total,5);assert.equal(stats.totals.supported,1);assert.equal(stats.totals.unsupported,3);assert.equal(stats.totals.rejected,1);
  assert.equal(stats.groups.reduce((n,g)=>n+g.total,0),5);assert.equal(stats.totals.observedRecent,0);f.db.close();
});
test('pasada nueva respeta lease vigente, backoff y demanda3h; programación no observa',()=>{
  const f=fixture();f.add('a');f.add('b');f.add('c',{productId:'recent',observed:now-3600000});f.seed();
  const time=now+DAY;
  const leases=claimRefreshBatch(f.db,{now:time,limit:2,productIds:['p']});
  acknowledgeRefresh(f.db,{...leases[1],now:time+1,outcome:'http-429',retryAfterMs:3600000});
  enqueueKnownProducts(f.db,{productIds:['recent'],now:time+2,freshMs:3*3600000});
  const before=f.db.prepare('SELECT * FROM pilot_refresh_demand ORDER BY offer_id').all(),prices=f.db.prepare('SELECT * FROM product_prices').all();
  f.seed({now:time+3});
  const after=f.db.prepare('SELECT * FROM pilot_refresh_demand ORDER BY offer_id').all();
  assert.equal(after[0].lease_token,before[0].lease_token);assert.equal(after[0].lease_until,before[0].lease_until);
  assert.equal(after[1].status,'backoff');assert.equal(after[1].due_at,before[1].due_at);assert.equal(after[1].attempts,before[1].attempts);
  assert.equal(after[2].due_at,before[2].due_at);assert.deepEqual(f.db.prepare('SELECT * FROM product_prices').all(),prices);
  const coverage=f.coverage({now:time+3,sinceStartedAt:time});assert.equal(coverage.totals.observedThisTrial,0);assert.equal(coverage.totals.blocked,1);f.db.close();
});
test('frescura heredada se separa de observación del ensayo y comparable exige basis coincidente',()=>{
  const f=fixture();f.add('old-fresh',{observed:now-3600000});f.add('new',{observed:now+10});f.add('reserved',{observed:now+20,stock:'unknown'});f.add('future',{observed:now+60000});
  for(const id of ['old-fresh','new','reserved']) {
    const raw=JSON.parse(f.db.prepare('SELECT row_json FROM product_prices WHERE id=?').get(id).row_json);
    f.db.prepare('INSERT INTO price_basis VALUES(?,?,?,?,?,?,?,?)').run('p','current',id,'shop',100,raw.stock,raw.url,raw.last_updated);
  }
  const stats=f.coverage({now:now+30,sinceStartedAt:now});
  assert.equal(stats.totals.observedRecent,3);assert.equal(stats.totals.comparableRecent,2);
  assert.equal(stats.totals.observedThisTrial,2);assert.equal(stats.totals.comparableThisTrial,1);assert.equal(stats.totals.locallyObservedRecent,0);
  const stale=f.coverage({now:now+DAY+30,sinceStartedAt:now});assert.equal(stale.totals.observedThisTrial,3);assert.equal(stale.totals.comparableThisTrial,0);
  f.db.prepare("UPDATE price_basis SET observed_at=? WHERE id='new'").run(new Date(now-1).toISOString());
  assert.equal(f.coverage({now:now+30,sinceStartedAt:now}).totals.comparableThisTrial,0);f.db.close();
});
test('cursor usa techo estable; altas detrás y delante entran en próxima pasada',()=>{
  const f=fixture();f.add('b');f.add('d');assert.equal(f.seed({batchSize:1}).cursor,'b');f.add('a');f.add('z');
  assert.equal(f.seed({batchSize:1}).complete,true);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM pilot_refresh_demand').get().n,2);
  finish(f.db,now+DAY);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM pilot_refresh_demand').get().n,4);f.db.close();
});
test('reloj regresivo y configuración distinta fallan sin cambiar cursor/cola; deadline acotado',()=>{
  const f=fixture();f.add('a');f.add('b');f.seed({batchSize:1});const state=f.db.prepare('SELECT * FROM pilot_rotation_state').get(),queue=f.db.prepare('SELECT * FROM pilot_refresh_demand').all();
  assert.throws(()=>f.seed({now:now-1}),/CLOCK_REGRESSION/);
  assert.throws(()=>f.seed({capabilities:{...capabilities,categories:[]}}),/CAPABILITIES_CHANGED/);
  assert.equal(f.seed({deadlineAt:now}).status,'deadline');assert.deepEqual(f.db.prepare('SELECT * FROM pilot_rotation_state').get(),state);
  assert.deepEqual(f.db.prepare('SELECT * FROM pilot_refresh_demand').all(),queue);
  let ticks=0;const partial=f.seed({deadlineAt:now+2,clock:()=>now+ticks++});assert.equal(partial.examined,1);assert.equal(partial.complete,true);
  assert.throws(()=>f.seed({passIntervalMs:19*3600000}),/INVALID_LIMITS/);f.db.close();
});
test('fallo posterior al encolado revierte también cola y cursor en el mismo commit',()=>{
  const f=fixture();f.add('a');const before=f.db.prepare('SELECT * FROM pilot_rotation_state').get();
  f.db.exec("CREATE TRIGGER reject_rotation BEFORE UPDATE ON pilot_rotation_state BEGIN SELECT RAISE(ABORT,'reject-test'); END;");
  assert.throws(()=>f.seed(),/reject-test/);assert.deepEqual(f.db.prepare('SELECT * FROM pilot_rotation_state').get(),before);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM pilot_refresh_demand').get().n,0);assert.equal(f.db.isTransaction,false);f.db.close();
});

test('capability recibe nombre exacto y conserva atributos incompletos en denominador no soportado',()=>{
  const f=fixture();f.add('a');f.add('b',{productId:'incomplete'});
  const attributes={SKU:'exact-mpn'};
  f.db.prepare('UPDATE products SET row_json=? WHERE id=?').run(JSON.stringify({name:'Ryzen 7600 AM5',specs:attributes}),'p');
  const seen=[],spec={...capabilities,validatorTarget:undefined,validateTarget:(storeId,url,category,name,specs)=>{
    seen.push({storeId,url,category,name,specs});return name==='Ryzen 7600 AM5'?true:{supported:false,reason:'insufficient-attributes'};
  }};
  const result=f.seed({capabilities:spec});assert.equal(result.supported,1);assert.equal(result.unsupported,1);
  assert.equal(result.reasons['insufficient-attributes'],1);assert.equal(seen[0].name,'Ryzen 7600 AM5');
  assert.deepEqual(seen[0].specs,attributes);assert.equal(seen[1].specs,undefined);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM pilot_refresh_demand').get().n,1);
  const coverage=f.coverage({capabilities:spec});assert.equal(coverage.totals.total,2);assert.equal(coverage.totals.reasons['insufficient-attributes'],1);f.db.close();
});
test('deadline a mitad de lote guarda sólo prefijo y próxima llamada continúa misma pasada',()=>{
  const f=fixture();for(const id of ['a','b','c'])f.add(id);
  let ticks=0;const first=f.seed({deadlineAt:now+2,clock:()=>now+ticks++});
  assert.equal(first.examined,1);assert.equal(first.cursor,'a');assert.equal(first.complete,false);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM pilot_refresh_demand').get().n,1);
  const next=f.seed({now:now+3});assert.equal(next.examined,2);assert.equal(next.complete,true);assert.equal(next.pass,1);f.db.close();
});
test('demanda con reloj futuro revierte nueva pasada sin avanzar cursor',()=>{
  const f=fixture();f.add('a');enqueueKnownProducts(f.db,{productIds:['p'],now:now+1});
  const state=f.db.prepare('SELECT * FROM pilot_rotation_state').get(),queue=f.db.prepare('SELECT * FROM pilot_refresh_demand').all();
  assert.throws(()=>f.seed(),/CLOCK_REGRESSION/);assert.deepEqual(f.db.prepare('SELECT * FROM pilot_rotation_state').get(),state);
  assert.deepEqual(f.db.prepare('SELECT * FROM pilot_refresh_demand').all(),queue);f.db.close();
});

test('comparable exige stock idéntico al basis y conserva frontera inclusiva24h del motor',()=>{
  const f=fixture();const raw=f.add('a',{observed:now-DAY});
  f.db.prepare('INSERT INTO price_basis VALUES(?,?,?,?,?,?,?,?)').run('p','current','a','shop',100,'low-stock',raw.url,raw.last_updated);
  const conflict=f.coverage();assert.equal(conflict.totals.observedRecent,1);assert.equal(conflict.totals.comparableRecent,0);
  f.db.prepare("UPDATE price_basis SET stock='in-stock'").run();assert.equal(f.coverage().totals.comparableRecent,1);
  assert.equal(f.coverage({now:now+1}).totals.observedRecent,0);assert.equal(f.coverage({now:now+1}).totals.comparableRecent,0);f.db.close();
});
