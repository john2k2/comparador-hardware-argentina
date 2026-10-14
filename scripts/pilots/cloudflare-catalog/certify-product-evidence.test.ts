import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync,mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { certifyProductEvidence } from './certify-product-evidence';
import { mapDbGuideProduct } from '@/lib/persistence/product-read-mapper';
import type { DbProductRow } from '@/lib/persistence/product-read-types';
const {rebuildProjection}=await import(pathToFileURL(resolve('scripts/pilots/cloudflare-catalog/projection.mjs')).href);
const {searchCatalog}=await import(pathToFileURL(resolve('scripts/pilots/cloudflare-catalog/engine.mjs')).href);
const {sqliteAdapter}=await import(pathToFileURL(resolve('scripts/pilots/cloudflare-catalog/sqlite-adapter.mjs')).href);
const now=Date.parse('2026-10-12T03:40:00Z'),observed=new Date(now-1000).toISOString();
const rgb='Memoria Corsair DDR4 16GB 3200MHz Vengeance RGB RS Black CL16';
function fixture(t:TestContext, sameStore = false){
 t.mock.method(Date,'now',()=>now);
 const dir=mkdtempSync(tmpdir()+'/catalog-certify-'),source=dir+'/source.sqlite',target=dir+'/certified.sqlite',db=new DatabaseSync(source);
 t.after(()=>rmSync(dir,{recursive:true}));db.exec(readFileSync('scripts/pilots/cloudflare-catalog/schema.sql','utf8'));
 db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('snapshot',JSON.stringify({counts:{},hashes:{}}));
 db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('production_catalog','old-certificate');
 const rawRows:Array<{id:string}>=[];
 const add=(id:string,name:string,category:string,offers:Array<{store:string;url:string;price:number;pending?:boolean;date?:string}>)=>{
  const raw={id,name,category,brand:'',model:'',specs:{},created_at:observed,updated_at:observed,lowest_price:123,highest_price:123,average_price:123};
  db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,category,id,name.toLowerCase(),name.toLowerCase(),1,0,observed,observed,JSON.stringify(raw));
  db.prepare('INSERT INTO product_substrings VALUES(?,?)').run(id,name.toLowerCase());
  db.prepare('INSERT INTO summaries VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,123,123,123,offers.length,offers.map(o=>o.url).join(' '),0,JSON.stringify(offers.map(o=>o.store)),null,null,observed,'{}');
  for(const [i,o]of offers.entries()){
   const row={id:`${id}-${i}`,product_id:id,store_id:o.store,url:o.url,price:o.price,stock:'in-stock',last_updated:o.date??observed,...o.pending?{identity_review:{version:1,status:'needs-review',reason:'provider-unavailable',model:null,confidence:null,reviewedAt:observed,subject:{name:name.toLowerCase(),category,url:o.url}}}:{}};
   rawRows.push(row);db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run(row.id,id,row.store_id,row.price,row.url,JSON.stringify(row));
   for(const kind of ['historical','current'])db.prepare('INSERT INTO price_basis VALUES(?,?,?,?,?,?,?,?)').run(id,kind,row.id,row.store_id,row.price,row.stock,row.url,row.last_updated);
  }
 };
 add('37bytes-ram','MEMORIA RAM 8GB DDR4 3600Mhz RGB DIMM KINGSTON KF436C17BB2A/8','memoria-ram',[{store:'37bytes',url:'https://www.37bytes.com.ar/productos/memoria-ram-8gb-ddr4-3600mhz-rgb-dimm-kingston-kf436c17bb2a-8/',price:213413,pending:true}]);
 add('katech-gpu','VIDEO QUADRO RTX PRO 2000 BLACKWELL 16GB GDDR7 4 MINI DISPLAY PORT','tarjetas-graficas',[{store:'katech',url:'https://katech.com.ar/producto/video-quadro-rtx-pro-2000-blackwell-16gb-gddr7-4-mini-display-port/',price:2912570,pending:true}]);
 add('rgb',rgb,'memoria-ram',[{store:'compragamer',url:'https://compragamer.com/producto/Memoria_Corsair_DDR4_16GB_3200MHz_Vengeance_LPX_Black_CL16_15560',price:251600,date:new Date(now-2*86400000).toISOString()},{store:'compragamer',url:'https://compragamer.com/producto/Memoria_Corsair_DDR4_16GB_3200MHz_Vengeance_RGB_RS_Black_CL16_15558',price:283600}]);
 add('empty','Gabinete sin observación','gabinetes',[]);
 db.prepare("DELETE FROM summaries WHERE product_id='empty'").run();
 if(sameStore)add('same-store','Gabinete Sentey P20','gabinetes',[{store:'katech',url:'https://katech.com.ar/producto/gabinete-sentey-p20-viejo/',price:100,date:new Date(now-2*86400000).toISOString()},{store:'katech',url:'https://katech.com.ar/producto/gabinete-sentey-p20-actual/',price:200}]);
 db.close();return{dir,source,target,rawRows};
}
async function parity(db:DatabaseSync,clock:number){
 for(const category of [null,'memoria-ram','tarjetas-graficas','gabinetes'])for(const current of [false,true])for(const stores of [[],['compragamer'],['37bytes']]){
  const result=await searchCatalog(sqliteAdapter(db),{p_category:category,p_min_price:current?0:null,p_stores:stores},{now:clock});
  for(const raw of result.products){const product=mapDbGuideProduct(raw as DbProductRow);assert.deepEqual([product.lowestPrice,product.highestPrice,product.averagePrice],[raw.lowest_price,raw.highest_price,raw.average_price],product.id);}
 }
}
test('normalización corrige mínimos pendientes, conserva conflictos y todas observaciones originales',async t=>{
 const f=fixture(t),receipt=certifyProductEvidence(f.source,f.target,{now,generation:'test',rebuildProjection}),db=new DatabaseSync(f.target,{readOnly:true});t.after(()=>db.close());
 assert.equal(receipt.products,4);assert.equal(receipt.offers,4);assert.equal(receipt.currentBasis,1);assert.equal(receipt.historicalBasis,1);
 assert.equal(receipt.missingSummaryRepaired,1);assert.equal(receipt.missingSummaryWithOffers,0);
 assert.equal(receipt.pendingOffers,3);assert.equal(receipt.productsWithoutComparable,3);
 // El vencimiento de la única oferta válida RGB y de las pendientes no cambia
 // la selección histórica. SQL seguirá quitando las vencidas del modo vigente.
 assert.equal(receipt.validUntil,'9999-12-31T23:59:59.999Z');
 assert.equal(db.prepare("SELECT value FROM pilot_meta WHERE key='production_catalog'").get(),undefined);
 assert.deepEqual(db.prepare('SELECT row_json FROM product_prices ORDER BY id').all().map(x=>JSON.parse(String(x.row_json))).sort((a,b)=>a.id.localeCompare(b.id)),f.rawRows.sort((a:{id:string},b:{id:string})=>a.id.localeCompare(b.id)));
 assert.equal(db.prepare("SELECT lowest FROM summaries WHERE product_id='37bytes-ram'").get()?.lowest,0);
 assert.equal(db.prepare("SELECT lowest FROM summaries WHERE product_id='katech-gpu'").get()?.lowest,0);
 assert.equal(JSON.parse(String(db.prepare("SELECT row_json FROM products WHERE id='empty'").get()?.row_json)).lowest_price,0);
 await parity(db,now);
 const empty=await searchCatalog(sqliteAdapter(db),{p_category:'gabinetes'},{now});assert.equal(empty.total,1);assert.equal(empty.products[0].lowest_price,0);
 assert.equal((await searchCatalog(sqliteAdapter(db),{p_category:'gabinetes',p_min_price:0},{now})).total,0);
 const original=new DatabaseSync(f.source,{readOnly:true});assert.equal(original.prepare("SELECT lowest FROM summaries WHERE product_id='37bytes-ram'").get()?.lowest,123);original.close();
});
test('RAM RGB no resucita LPX al vencer24h; engine y mapper mantienen histórico correcto',async t=>{
 const f=fixture(t);certifyProductEvidence(f.source,f.target,{now,generation:'test',rebuildProjection});
 const db=new DatabaseSync(f.target,{readOnly:true});t.after(()=>db.close());
 for(const clock of [now,Date.parse(observed)+86400000,Date.parse(observed)+86400000+1]){
  t.mock.method(Date,'now',()=>clock);await parity(db,clock);
  const result=await searchCatalog(sqliteAdapter(db),{p_category:'memoria-ram'},{now:clock});assert.equal(result.products.find((x:{id:string})=>x.id==='rgb')?.lowest_price,283600);
  const current=await searchCatalog(sqliteAdapter(db),{p_category:'memoria-ram',p_min_price:0},{now:clock});assert.equal(current.total,clock<=Date.parse(observed)+86400000?1:0);
 }
});
test('rechaza fuente como destino, destinos existentes y reloj falso antes de copiar',t=>{
 const f=fixture(t);
 assert.throws(()=>certifyProductEvidence(f.source,f.source,{now,generation:'test',rebuildProjection}),/NEW_COPY_REQUIRED/);
 assert.throws(()=>certifyProductEvidence(f.source,f.target,{now:now+5000,generation:'test',rebuildProjection}),/CLOCK_OR_PROJECTION_INVALID/);
});

test('resumen histórico same-store exige regeneración al vencer el horizonte, sin inventar observación',async t=>{
 const f=fixture(t,true),receipt=certifyProductEvidence(f.source,f.target,{now,generation:'test',rebuildProjection});
 const db=new DatabaseSync(f.target,{readOnly:true});t.after(()=>db.close());await parity(db,now);
 const after=Date.parse(observed)+86400000+1;t.mock.method(Date,'now',()=>after);
 assert.equal(Date.parse(receipt.validUntil),after);
 const stale=await searchCatalog(sqliteAdapter(db),{p_category:'gabinetes'},{now:after}),row=stale.products.find((x:{id:string})=>x.id==='same-store');
 assert.equal(row.lowest_price,200);assert.equal(mapDbGuideProduct(row).lowestPrice,100);
 const freshTarget=f.dir+'/clock-regenerated.sqlite';
 const next=certifyProductEvidence(f.source,freshTarget,{now:after,generation:'expired-clock',rebuildProjection});
 assert.equal(next.offersSha256,receipt.offersSha256);
 const regenerated=new DatabaseSync(freshTarget,{readOnly:true});t.after(()=>regenerated.close());await parity(regenerated,after);
 const result=await searchCatalog(sqliteAdapter(regenerated),{p_category:'gabinetes'},{now:after});assert.equal(result.products.find((x:{id:string})=>x.id==='same-store').lowest_price,100);
});
