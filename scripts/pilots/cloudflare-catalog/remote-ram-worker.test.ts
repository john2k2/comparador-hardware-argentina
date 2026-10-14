import { describe,it } from 'node:test';
import assert from 'node:assert/strict';
import { verifyAdmittedRamOffer } from './remote-ram-worker';
import { proveManufacturerRamAttributes } from '@/lib/quality/offer-attribute-proof';
import { normalizeIdentityText } from '@/lib/product-identity';
const title='Memoria Corsair DDR4 16GB 3200MHz Vengeance RGB RS Black CL16',sku='CMG16GX4M1E3200C16';
const url='https://compragamer.com/producto/Memoria_15558',listingRef='compragamer:id:15558';
function fixture(){
 const product={name:title,category:'memoria-ram',specs:{SKU:sku}};
 const sourceIdentity={title,storeSku:sku,listingRef,sourceId:'15558'};
 const proof=proveManufacturerRamAttributes({title,sku,specs:product.specs},{title,sku,specs:{SKU:sku}},{storeId:'compragamer',url,listingRef});
 if(!proof)throw Error('fixture');
 const raw={price:123456,store_id:'compragamer',url,stock:'in-stock',source_identity:sourceIdentity,
   identity_review:{version:1,status:'consistent',reason:'manufacturer-ram',reviewedAt:'2026-10-11T23:00:00Z',model:null,confidence:null,
     subject:{name:normalizeIdentityText(title),category:'memoria-ram',url},sourceIdentity,proof}};
 return{raw,product};
}
describe('verificación real de atributos en admisión privada RAM',()=>{
 it('revalida después de JSON sin cambiar títulos ni producto',()=>{const f=JSON.parse(JSON.stringify(fixture()));assert.equal(verifyAdmittedRamOffer(f.raw,f.product),true);assert.equal(f.raw.source_identity.title,title);assert.equal(f.product.name,title);});
 for(const kind of ['sku','kit','source','proof','url','stock','price','missing-context','missing-source'])it(`rechaza ${kind} aunque el payload conserve los cuatro IDs autorizados`,()=>{
  const f=fixture();
  if(kind==='sku')f.product.specs.SKU='CMK8GX4M1E3200C16';
  if(kind==='kit')Object.assign(f.product.specs,{kit:'2x8GB'});
  if(kind==='source')f.raw.source_identity.storeSku='different';
  if(kind==='proof')f.raw.identity_review.proof.attributes.capacity='32';
  if(kind==='url')f.raw.url='https://compragamer.com/producto/Memoria_15522';
  if(kind==='stock')f.raw.stock='unknown';
  if(kind==='price')f.raw.price=0;
  if(kind==='missing-context')Object.assign(f.product,{specs:{}});
  if(kind==='missing-source')Object.assign(f.raw,{source_identity:undefined});
  assert.equal(verifyAdmittedRamOffer(f.raw,f.product),false);
 });
});
