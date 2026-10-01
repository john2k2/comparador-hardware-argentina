import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({fetch:vi.fn()}));
vi.mock('./source-http',async()=>({...await vi.importActual<typeof import('./source-http')>('./source-http'),sourceFetch:mocks.fetch}));
import {fetchWooStoreKnownBatch,parseWooStoreKnownProducts} from './woocommerce-known-batch';
const url='https://maxtecno.com.ar/producto/ram-kingston/';
const targets=[{url,category:'memoria-ram' as const}];
const at=new Date('2026-10-01T22:00:00Z');
const item={id:123,name:'Memoria RAM Kingston DDR4 16GB',permalink:url,sku:'KF432C16',type:'simple',has_options:false,is_in_stock:true,is_purchasable:true,is_on_backorder:false,
 prices:{price:'40348931',currency_code:'ARS',currency_minor_unit:2,price_range:null},stock_availability:{class:'in-stock'}};
beforeEach(()=>vi.resetAllMocks());
it('conserva centavos, SKU y hora real de lectura de la publicación exacta',()=>{
 const products=parseWooStoreKnownProducts([item],'maxtecno',targets,at);
 expect(products).toHaveLength(1);expect(products[0].specs.SKU).toBe('KF432C16');
 expect(products[0].prices[0]).toMatchObject({price:403489.31,stock:'in-stock',lastUpdated:at,url,priceCondition:'special'});
});
it.each([{type:'variable'},{has_options:true},{permalink:'https://evil.example/producto/ram-kingston/'},{permalink:url+'?variant=2'},{prices:{...item.prices,currency_code:'USD'}},{prices:{...item.prices,currency_minor_unit:9}},{prices:{...item.prices,price:'NaN'}},{prices:{...item.prices,price_range:{min_amount:'100'}}},{name:'§ITEMTIT§'},{is_password_protected:true}])('rechaza variaciones y respuestas ambiguas: %j',overrides=>{
 expect(parseWooStoreKnownProducts([{...item,...overrides}],'maxtecno',targets,at)).toEqual([]);
});
it('un pedido pendiente o un stock contradictorio no se transforma en disponibilidad',()=>{
 expect(parseWooStoreKnownProducts([{...item,is_on_backorder:true}],'maxtecno',targets,at)[0].prices[0].stock).toBe('unknown');
 expect(parseWooStoreKnownProducts([{...item,is_in_stock:false}],'maxtecno',targets,at)[0].prices[0].stock).toBe('unknown');
 expect(parseWooStoreKnownProducts([{...item,is_in_stock:false,stock_availability:{class:'out-of-stock'}}],'maxtecno',targets,at)[0].prices[0].stock).toBe('out-of-stock');
});
it('excluye SCP aunque responda un JSON válido: no pasó la corroboración de precio',()=>{
 expect(parseWooStoreKnownProducts([item],'scphardstore',targets,at)).toEqual([]);
});
it('agrupa slugs en una lectura y no inventa observaciones para publicaciones ausentes',async()=>{
 mocks.fetch.mockResolvedValue(new Response(JSON.stringify([item]),{headers:{'content-type':'application/json'}}));
 const products=await fetchWooStoreKnownBatch('maxtecno',[...targets,{url:'https://maxtecno.com.ar/producto/otra/',category:'memoria-ram'}]);
 expect(products).toHaveLength(1);expect(mocks.fetch).toHaveBeenCalledTimes(1);
 const called=new URL(mocks.fetch.mock.calls[0][1]);expect(called.searchParams.get('slug')).toBe('ram-kingston,otra');
 expect(called.searchParams.get('per_page')).toBe('100');
});
it('no realiza solicitudes para destinos de otro dominio',async()=>{
 await expect(fetchWooStoreKnownBatch('maxtecno',[{url:'https://evil.example/producto/ram/',category:'memoria-ram'}])).rejects.toThrow('invalid-response');
 expect(mocks.fetch).not.toHaveBeenCalled();
});
