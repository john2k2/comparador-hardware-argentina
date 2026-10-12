import test,{type TestContext}from'node:test';import assert from'node:assert/strict';import{DatabaseSync}from'node:sqlite';import{readFileSync}from'node:fs';
import{selectSharedCandidates}from'./shared-catalog-cli';import{stageSharedObservations}from'./shared-catalog-local';import{initializeRefreshDemand}from'./refresh-demand.mjs';import type{Product}from'@/lib/types';
const now=Date.parse('2026-10-12T04:40:00Z'),old=new Date(now-2*86400000).toISOString(),name='Memoria Corsair DDR4 8GB 3200Mhz Vengeance LPX Black CL16',sku='CMK8GX4M1E3200C16',url='https://compragamer.com/producto/Memoria_Corsair_DDR4_8GB_3200Mhz_Vengeance_LPX_Black_CL16_15522';
function fixture(t:TestContext,count=1){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(readFileSync('scripts/pilots/cloudflare-catalog/schema.sql','utf8'));initializeRefreshDemand(db);
 db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?)').run('ram','memoria-ram','ram',name.toLowerCase(),name.toLowerCase(),1,0,old,old,JSON.stringify({id:'ram',name,category:'memoria-ram',specs:{SKU:sku}}));
 for(let i=0;i<count;i++){const id='o'+String(i).padStart(2,'0');db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run(id,'ram','compragamer',100,url,JSON.stringify({id,last_updated:old}));}
 const source={name,category:'memoria-ram',specs:{SKU:sku},prices:[{storeId:'compragamer',url,price:200,stock:'in-stock',lastUpdated:new Date(now)}]}as unknown as Product;
 stageSharedObservations(db,[{reference:'compragamer:id:15522',product:source}],{now});return{db,source};
}
test('SKU RAM fabricante selecciona sin completar ni reescribir títulos y ofertas',t=>{
 const f=fixture(t),before=f.db.prepare('SELECT * FROM product_prices').all();assert.deepEqual(selectSharedCandidates(f.db,now),[{offerId:'o00',productId:'ram'}]);assert.deepEqual(f.db.prepare('SELECT * FROM product_prices').all(),before);
});
for(const conflict of ['sku','kit'])test(`captura RAM con conflicto ${conflict} no se selecciona`,t=>{
 const f=fixture(t);if(conflict==='sku')f.source.specs.SKU='CMG16GX4M1E3200C16';else f.source.specs.Kit='2x4';
 stageSharedObservations(f.db,[{reference:'compragamer:id:15522',product:f.source}],{now:now+1}); // Cambiar captura exige fecha realmente posterior.
 // Reemplazar con nueva captura fechada; una fecha igual jamás actualiza la fila.
 f.source.prices[0].lastUpdated=new Date(now+2);stageSharedObservations(f.db,[{reference:'compragamer:id:15522',product:f.source}],{now:now+2});
 assert.deepEqual(selectSharedCandidates(f.db,now+2),[]);
});
test('veinticinco filas en backoff no ocultan la siguiente elegible; lease vivo tampoco se fuerza',t=>{
 const f=fixture(t,27);
 for(let i=0;i<26;i++)f.db.prepare(`INSERT INTO pilot_refresh_demand(offer_id,product_id,store_id,url,requested_at,expires_at,due_at,priority,status,lease_until) VALUES(?,?,?,?,?,?,?,?,?,?)`).run('o'+String(i).padStart(2,'0'),'ram','compragamer',url,now,now+86400000,now+3600000,100,i===25?'leased':'backoff',i===25?now+60000:null);
 assert.deepEqual(selectSharedCandidates(f.db,now),[{offerId:'o26',productId:'ram'}]);
});
test('pausa de tienda persiste sin lectura HTTP ni mutaciones de cola',t=>{
 const f=fixture(t);f.db.prepare('INSERT INTO pilot_cycle_store_pause VALUES(?,?,?)').run('compragamer',now+3600000,'http-429');assert.deepEqual(selectSharedCandidates(f.db,now),[]);
});

for(const category of ['motherboards','gabinetes','fuentes-alimentacion','refrigeracion','perifericos'] as const)test(`selector exact-listing ${category} exige captura de SKU/categoría/ID/título`,t=>{
 const f=fixture(t),title=category==='motherboards'?'Mother ASUS PRIME B650M-A II AM5 DDR5':category==='gabinetes'?'Gabinete ASUS AP201 Black':category==='fuentes-alimentacion'?'Fuente Asrock Steel Legend 750W':category==='refrigeracion'?'Cooler DeepCool ASSASSIN IV':'Mouse Logitech M240 Rose',code='CODE-123';
 f.db.prepare('UPDATE products SET category=?,row_json=?').run(category,JSON.stringify({id:'ram',name:title,category,specs:{SKU:code}}));
 f.source.id='cg-15522';f.source.name=title;f.source.category=category;f.source.specs.SKU=code;f.source.prices[0].lastUpdated=new Date(now+1);
 stageSharedObservations(f.db,[{reference:'compragamer:id:15522',product:f.source}],{now:now+1});
 assert.deepEqual(selectSharedCandidates(f.db,now+1,500),[{offerId:'o00',productId:'ram'}]);
 f.source.specs.SKU='other';f.source.prices[0].lastUpdated=new Date(now+2);stageSharedObservations(f.db,[{reference:'compragamer:id:15522',product:f.source}],{now:now+2});assert.deepEqual(selectSharedCandidates(f.db,now+2,500),[]);
});
test('selector no habilita computadoras por tener título y SKU repetidos',t=>{
 const f=fixture(t),title='Notebook ASUS Vivobook',code='X1504';f.db.prepare('UPDATE products SET category=?,row_json=?').run('computadoras',JSON.stringify({id:'ram',name:title,category:'computadoras',specs:{SKU:code}}));
 f.source.id='cg-15522';f.source.name=title;f.source.category='computadoras';f.source.specs.SKU=code;f.source.prices[0].lastUpdated=new Date(now+1);stageSharedObservations(f.db,[{reference:'compragamer:id:15522',product:f.source}],{now:now+1});assert.deepEqual(selectSharedCandidates(f.db,now+1,500),[]);
});
