import test,{type TestContext}from'node:test';import assert from'node:assert/strict';
import{DatabaseSync}from'node:sqlite';import{mkdtempSync,readFileSync,rmSync}from'node:fs';import{tmpdir}from'node:os';
import{admitMacObservations,planMacObservationAdmission}from'./admit-mac-observations';
const now=Date.parse('2026-10-12T04:00:00Z'),old='2026-10-10T12:00:00Z',recent='2026-10-12T02:54:28.295Z';
const name='Memoria Corsair DDR4 16GB 3200MHz Vengeance RGB RS Black CL16',url='https://compragamer.com/producto/Memoria_Corsair_DDR4_16GB_3200MHz_Vengeance_RGB_RS_Black_CL16_15558',sku='CMG16GX4M1E3200C16';
function fixture(t:TestContext){
 const dir=mkdtempSync(tmpdir()+'/admit-mac-'),full=dir+'/full.sqlite',sample=dir+'/sample.sqlite',target=dir+'/admitted.sqlite';t.after(()=>rmSync(dir,{recursive:true}));
 for(const file of[full,sample]){
  const db=new DatabaseSync(file);db.exec(readFileSync('scripts/pilots/cloudflare-catalog/schema.sql','utf8'));
  db.exec('CREATE TABLE pilot_offer_observations(offer_id TEXT,observed_at TEXT,row_json TEXT,PRIMARY KEY(offer_id,observed_at))');
  db.exec('CREATE TABLE pilot_refresh_demand(offer_id TEXT PRIMARY KEY,last_error TEXT)');
  db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('snapshot','{}');db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('production_catalog','old-ready');
  const product={id:'ram',name,category:'memoria-ram',specs:{SKU:sku},created_at:old,updated_at:old};
  db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?)').run('ram','memoria-ram','ram',name.toLowerCase(),name.toLowerCase(),1,0,old,old,JSON.stringify(product));
  const raw={id:'offer',product_id:'ram',store_id:'compragamer',url,price:251600,stock:'in-stock',last_updated:old,source_identity:{title:name,storeSku:sku,listingRef:'compragamer:id:15558'}};
  db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run(raw.id,raw.product_id,raw.store_id,raw.price,url,JSON.stringify(raw));
  db.close();
 }
 const observe=(patch:Record<string,unknown>={},event=true)=>{
  const db=new DatabaseSync(sample);const raw={...JSON.parse(String(db.prepare('SELECT row_json FROM product_prices WHERE id=?').get('offer')?.row_json)),price:283600,last_updated:recent,...patch};
  db.prepare('UPDATE product_prices SET id=?,product_id=?,store_id=?,price=?,url=?,row_json=? WHERE id=?').run(raw.id,raw.product_id,raw.store_id,raw.price,raw.url,JSON.stringify(raw),'offer');
  if(event)db.prepare('INSERT OR REPLACE INTO pilot_offer_observations VALUES(?,?,?)').run(raw.id,raw.last_updated,JSON.stringify(raw));db.close();return raw;
 };
 return{dir,full,sample,target,observe};
}
test('admite observación más nueva con stock agotado y fecha real; conserva fuentes y retira activación',t=>{
 const f=fixture(t),raw=f.observe({stock:'out-of-stock'}),receipt=admitMacObservations(f.full,f.sample,f.target,{now});
 assert.equal(receipt.denominator,1);assert.equal(receipt.accepted,1);assert.equal(receipt.rejected,0);
 const db=new DatabaseSync(f.target,{readOnly:true});assert.deepEqual(JSON.parse(String(db.prepare('SELECT row_json FROM product_prices').get()?.row_json)),raw);
 assert.equal(db.prepare("SELECT value FROM pilot_meta WHERE key='production_catalog'").get(),undefined);db.close();
 const original=new DatabaseSync(f.full,{readOnly:true});assert.equal(JSON.parse(String(original.prepare('SELECT row_json FROM product_prices').get()?.row_json)).last_updated,old);original.close();
 assert.equal(receipt.changes[0].observedAt,recent);assert.equal(receipt.changes[0].previousObservedAt,old);assert.equal(receipt.targetHashes.products,receipt.sourceHashes.full.products);
});
test('no-new-date y reader_noobservation no rejuvenecen una oferta',t=>{
 const f=fixture(t);f.observe({last_updated:old});const db=new DatabaseSync(f.sample);db.prepare('INSERT INTO pilot_refresh_demand VALUES(?,?)').run('offer','reader_noobservation');db.close();
 const receipt=admitMacObservations(f.full,f.sample,f.target,{now});assert.equal(receipt.accepted,0);assert.equal(receipt.reasons['no-new-observation-date'],1);assert.equal(receipt.decisions[0].lastAttemptError,'reader_noobservation');
 assert.equal(receipt.targetHashes.product_prices,receipt.sourceHashes.full.product_prices);
});
test('fecha nueva sin evento cuyo contenido coincida se rechaza',t=>{
 const f=fixture(t);f.observe({},false);assert.equal(planMacObservationAdmission(f.full,f.sample,{now}).reasons['observation-event-unproven'],1);
});
test('referencia o ID de fuente contradictorios no admiten precio, aunque no exista dictamen',t=>{
 for(const source_identity of [{title:name,storeSku:sku,listingRef:'compragamer:id:99999'},
   {title:name,storeSku:sku,listingRef:'compragamer:id:15558',sourceId:'99999'}]){
  const f=fixture(t);f.observe({source_identity});
  const receipt=admitMacObservations(f.full,f.sample,f.target,{now});
  assert.equal(receipt.accepted,0);assert.equal(receipt.reasons['source-identity-unproven'],1);
  assert.equal(receipt.targetHashes.product_prices,receipt.sourceHashes.full.product_prices);
 }
});
test('SKU distinto en producto sample o identidad de oferta no se admite como misma variante',t=>{
 const f=fixture(t);f.observe();const db=new DatabaseSync(f.sample),raw=JSON.parse(String(db.prepare('SELECT row_json FROM products').get()?.row_json));raw.specs.SKU='CMK16GX4M1E3200C16';db.prepare('UPDATE products SET row_json=?').run(JSON.stringify(raw));db.close();
 assert.equal(planMacObservationAdmission(f.full,f.sample,{now}).reasons['product-variant-unproven'],1);
 const second=fixture(t);second.observe({source_identity:{title:name,storeSku:'CMK16GX4M1E3200C16',listingRef:'compragamer:id:15558'}});assert.equal(planMacObservationAdmission(second.full,second.sample,{now}).reasons['source-sku-conflict'],1);
});
test('ID fuera del full y asociación distinta quedan explícitamente rechazados sin mover datos',t=>{
 const f=fixture(t);f.observe({id:'new-offer'});assert.equal(planMacObservationAdmission(f.full,f.sample,{now}).reasons['offer-id-outside-full'],1);
 const second=fixture(t),other=new DatabaseSync(second.sample);const p=JSON.parse(String(other.prepare('SELECT row_json FROM products').get()?.row_json));p.id='other-product';
 other.prepare("INSERT INTO products SELECT ?,category,catalog_identity,catalog_name,catalog_document,catalog_component,grouped_identity,last_scraped_at,updated_at,? FROM products WHERE id='ram'").run(p.id,JSON.stringify(p));other.close();second.observe({product_id:'other-product'});const receipt=admitMacObservations(second.full,second.sample,second.target,{now});assert.equal(receipt.reasons['association-changed-quarantine'],1);assert.equal(receipt.accepted,0);
});
test('captura transaccional ve evento y oferta aún en WAL; falla posterior no borra observación válida',t=>{
 const f=fixture(t),db=new DatabaseSync(f.sample);db.exec('PRAGMA journal_mode=WAL');db.exec('PRAGMA wal_autocheckpoint=0');
 const raw={...JSON.parse(String(db.prepare('SELECT row_json FROM product_prices').get()?.row_json)),price:283600,last_updated:recent};
 db.exec('BEGIN IMMEDIATE');db.prepare('UPDATE product_prices SET price=?,row_json=?').run(raw.price,JSON.stringify(raw));db.prepare('INSERT INTO pilot_offer_observations VALUES(?,?,?)').run(raw.id,recent,JSON.stringify(raw));db.prepare('INSERT INTO pilot_refresh_demand VALUES(?,?)').run(raw.id,'reader_noobservation');db.exec('COMMIT');
 try{const receipt=admitMacObservations(f.full,f.sample,f.target,{now});assert.equal(receipt.accepted,1);assert.equal(receipt.decisions[0].lastAttemptError,'reader_noobservation');}finally{db.close();}
});

test('conflicto del registro histórico revierte admisión y deja copia sin activación',t=>{
 const f=fixture(t);f.observe();const db=new DatabaseSync(f.full);db.prepare('INSERT INTO pilot_offer_observations VALUES(?,?,?)').run('offer',recent,'{}');db.close();
 assert.throws(()=>admitMacObservations(f.full,f.sample,f.target,{now}),/HISTORY_CONFLICT/);
 const target=new DatabaseSync(f.target,{readOnly:true});assert.equal(JSON.parse(String(target.prepare('SELECT row_json FROM product_prices').get()?.row_json)).last_updated,old);assert.equal(target.prepare("SELECT value FROM pilot_meta WHERE key='production_catalog'").get(),undefined);target.close();
});
