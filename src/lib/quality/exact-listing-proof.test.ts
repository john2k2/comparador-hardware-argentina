import{describe,it,expect}from'vitest';
import{proveExactListing,exactListingProofMatches}from'./exact-listing-proof';
import{attributeProofMatches}from'./offer-attribute-proof';import{readIdentityReview,needsIdentityReview}from'./offer-identity';
import{mapDbGuideProduct}from'@/lib/persistence/product-read-mapper';import type{DbProductRow}from'@/lib/persistence/product-read-types';
import{normalizeIdentityText}from'@/lib/product-identity';import{computeComparableStorePriceStats}from'@/lib/price-utils';
const families=[['motherboards','Mother ASUS PRIME B650M-A II AM5 DDR5','90MB1EH0-M0EAY0'],['gabinetes','Gabinete ASUS PRIME AP201 TG Black','90DC00G0-B38010'],['fuentes-alimentacion','Fuente Asrock 750W Gold Steel Legend','SL-750G'],['refrigeracion','Cooler CPU DeepCool ASSASSIN IV VC Vision','R-ASN4-BKNVMD-G'],['perifericos','Mouse Logitech M240 Silent Bluetooth Rose','910-007117']];
const binding={storeId:'compragamer',url:'https://compragamer.com/producto/PRODUCTO_12345',listingRef:'compragamer:id:12345',sourceId:'12345'};
function fixture(){const[category,title,sku]=families[0],subject={title,category,sku},proof=proveExactListing(subject,subject,binding)!;
 const sourceIdentity={title,storeSku:sku,listingRef:binding.listingRef,sourceId:binding.sourceId};
 const review={version:1 as const,status:'consistent' as const,reason:'exact-listing' as const,model:null,confidence:null,reviewedAt:'2026-10-12T05:00:00Z',subject:{name:normalizeIdentityText(title),category,url:binding.url},sourceIdentity,proof};
 return{title,category,sku,proof,sourceIdentity,review,product:{name:title,category,specs:{SKU:sku}},offer:{storeId:'compragamer',storeName:'CompraGamer',url:binding.url,price:200,stock:'in-stock' as const,lastUpdated:new Date('2026-10-12T05:00:00Z'),installment:null,sourceIdentity,identityReview:review}};}
describe('proof exact-listing v3',()=>{
 it.each(families)('acredita sólo publicación existente %s con título completo y código literal',(category,title,sku)=>{
  const proof=proveExactListing({title,category,sku},{title:title.toUpperCase(),category,sku},binding)!;expect(proof?.method).toBe('exact-listing');expect(proof).not.toHaveProperty('mpn');
  const source={title:title.toUpperCase(),storeSku:sku,sourceId:binding.sourceId,listingRef:binding.listingRef};expect(exactListingProofMatches(proof,{name:title,category,specs:{SKU:sku,Stock:'99',Garantia:'24 meses'}},source,binding.url)).toBe(true);
 });
 it.each(['Kit','Combo','OUTLET','Usado','BULK','OEM','Notebook','PC','+'])('excluye composición/condición %s',marker=>{const f=fixture(),title=f.title+' '+marker;expect(proveExactListing({title,category:f.category,sku:f.sku},{title,category:f.category,sku:f.sku},binding)).toBeNull();});
 it('SKU solo, título reordenado, categoría, MPN ausente y publicación distinta no acreditan',()=>{
  const f=fixture(),t={title:f.title,category:f.category,sku:f.sku};
  for(const source of[{...t,title:f.title.replace('II','III')},{...t,title:f.title.split(' ').reverse().join(' ')},{...t,sku:f.sku.toLowerCase()},{...t,sku:''},{...t,category:'computadoras'}])expect(proveExactListing(t,source,binding)).toBeNull();
  for(const b of[{...binding,sourceId:'12346'},{...binding,listingRef:'compragamer:id:12346'},{...binding,url:'https://compragamer.com/producto/PRODUCTO_12346'},{...binding,storeId:'katech'}])expect(proveExactListing(t,t,b)).toBeNull();
 });
 it('JSON revalidado conserva v3 pero mutación de cada contexto invalida sin renovar oferta',()=>{
  const f=fixture(),json=JSON.parse(JSON.stringify(f.review));expect(readIdentityReview(json)?.status).toBe('consistent');expect(needsIdentityReview(f.offer,f.product)).toBe(false);
  expect(attributeProofMatches(f.proof,f.title,f.category,f.title)).toBe(false);
  for(const product of[{...f.product,name:f.title+' White'},{...f.product,category:'perifericos'},{...f.product,specs:{SKU:'other'}},{...f.product,specs:{}}])expect(needsIdentityReview(f.offer,product)).toBe(true);
  for(const offer of[{...f.offer,url:binding.url+'0'},{...f.offer,storeId:'katech'},{...f.offer,sourceIdentity:{...f.sourceIdentity,storeSku:'other'}},{...f.offer,sourceIdentity:{...f.sourceIdentity,sourceId:'12346'}},{...f.offer,sourceIdentity:{...f.sourceIdentity,title:f.title+' WIFI'}},{...f.offer,sourceIdentity:{...f.sourceIdentity,listingRef:'compragamer:id:12346'}}])expect(needsIdentityReview(offer,f.product)).toBe(true);
  for(const path of['title','category','sku'] as const){const broken=JSON.parse(JSON.stringify(f.review));broken.proof.target[path]='other';expect(readIdentityReview(broken)?.status).toBe('needs-review');}
 });
 it('sin contexto actual falla cerrado en stats y tampoco admite proof mutilado',()=>{
  const f=fixture();expect(computeComparableStorePriceStats([f.offer]).lowest).toBe(0);expect(computeComparableStorePriceStats([f.offer],f.product).lowest).toBe(200);
  const broken=JSON.parse(JSON.stringify(f.review));delete broken.proof.binding;expect(readIdentityReview(broken)?.status).toBe('needs-review');
  const malformed=JSON.parse(JSON.stringify(f.review));malformed.proof.target.title={wrong:true};expect(readIdentityReview(malformed)?.status).toBe('needs-review');
  const extra=JSON.parse(JSON.stringify(f.review));extra.proof.mpn='inventado';expect(readIdentityReview(extra)?.status).toBe('needs-review');
 });
 it('mapper de lectura completa usa SKU actual e invalida aprobación sin ocultar oferta histórica',()=>{
  const f=fixture(),row={id:'p',name:f.title,category:f.category,specs:{SKU:f.sku},created_at:'2026-10-12T05:00:00Z',updated_at:'2026-10-12T05:00:00Z',lowest_price:200,highest_price:200,average_price:200,
    product_prices:[{store_id:'compragamer',url:binding.url,price:200,original_price:null,stock:'in-stock',installment_count:null,installment_amount:null,last_updated:'2026-10-12T05:00:00Z',source_identity:f.sourceIdentity,identity_review:f.review}]}as DbProductRow;
  expect(mapDbGuideProduct(row).lowestPrice).toBe(200);
  const changed=mapDbGuideProduct({...row,specs:{SKU:'another'}});expect(changed.lowestPrice).toBe(0);expect(changed.prices).toHaveLength(1);expect(changed.prices[0].lastUpdated.toISOString()).toBe('2026-10-12T05:00:00.000Z');
 });
});
