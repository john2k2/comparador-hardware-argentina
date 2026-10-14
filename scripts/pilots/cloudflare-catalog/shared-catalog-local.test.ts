import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { stageSharedObservations } from './shared-catalog-local';
import { selectSharedCandidates } from './shared-catalog-cli';
import type { Product } from '@/lib/types';
const now=Date.parse('2026-10-11T15:00:00Z'),old=new Date(now-2*86400000).toISOString();
function fixture() {
  const db=new DatabaseSync(':memory:');db.exec(readFileSync('scripts/pilots/cloudflare-catalog/schema.sql','utf8'));
  const name='Procesador AMD Ryzen 5 5500',url='https://compragamer.com/producto/Procesador_AMD_Ryzen_5_5500_13359';
  db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?)').run('p','procesadores','cpu',name,name,1,0,old,old,JSON.stringify({id:'p',name}));
  db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run('o','p','compragamer',100,url,JSON.stringify({id:'o',last_updated:old}));
  const product={name,category:'procesadores',prices:[{storeId:'compragamer',url,price:200,stock:'in-stock',lastUpdated:new Date(now)}]} as unknown as Product;
  return {db,product,observation:{reference:'compragamer:id:13359',product}};
}
test('una fuente compartida conserva etapa privada y no modifica precio/fecha del catálogo',()=>{
  const f=fixture(),before=f.db.prepare('SELECT * FROM product_prices').all();
  const receipt=stageSharedObservations(f.db,[f.observation],{now});
  assert.equal(receipt.outcomes['exact-attributes'],1);assert.equal(receipt.sourceListings,1);
  assert.deepEqual(f.db.prepare('SELECT * FROM product_prices').all(),before);f.db.close();
});
test('fuente ausente no convierte un producto en agotado',()=>{
  const f=fixture();const receipt=stageSharedObservations(f.db,[],{now});
  assert.equal(receipt.outcomes['not-in-response'],1);assert.equal(receipt.rawOffersChanged,0);f.db.close();
});
test('un Ryzen diferente se aísla y no aparece como coincidencia exacta',()=>{
  const f=fixture();f.product.name='Procesador AMD Ryzen 7 7700';
  assert.equal(stageSharedObservations(f.db,[f.observation],{now}).outcomes['identity-conflict'],1);f.db.close();
});
test('no renueva la fecha al reutilizar una captura ni acepta fechas futuras',()=>{
  const f=fixture();stageSharedObservations(f.db,[f.observation],{now});
  assert.equal(stageSharedObservations(f.db,[f.observation],{now:now+1000}).stagedWrites,0);
  f.product.prices[0].lastUpdated=new Date(now+1000);
  assert.throws(()=>stageSharedObservations(f.db,[f.observation],{now}),/SHARED_LOCAL_SOURCE/);f.db.close();
});
test('rechaza duplicados y URL de publicación distinta antes de escribir',()=>{
  const f=fixture();assert.throws(()=>stageSharedObservations(f.db,[f.observation,f.observation],{now}),/SHARED_LOCAL_SOURCE/);
  assert.throws(()=>stageSharedObservations(f.db,[{...f.observation,reference:'compragamer:id:42'}],{now}),/SHARED_LOCAL_SOURCE/);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM sqlite_schema WHERE name='pilot_listing_observations'").get()?.n,0);f.db.close();
});
test('CLI selecciona sólo ofertas antiguas probadas y no reclama otra fuente alterada',()=>{
  const f=fixture();
  try {
    stageSharedObservations(f.db,[f.observation],{now});
    assert.deepEqual(selectSharedCandidates(f.db,now),[{offerId:'o',productId:'p'}]);
    const original=f.db.prepare('SELECT row_json FROM product_prices').get()!.row_json;
    f.db.prepare('UPDATE product_prices SET row_json=?').run(JSON.stringify({id:'o',last_updated:new Date(now).toISOString()}));
    assert.deepEqual(selectSharedCandidates(f.db,now),[]);
    f.db.prepare('UPDATE product_prices SET row_json=?').run(original);
    f.db.exec("UPDATE pilot_listing_observations SET source_hash='alterado'");
    assert.deepEqual(selectSharedCandidates(f.db,now),[]);
  } finally { f.db.close(); }
});
