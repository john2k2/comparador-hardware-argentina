import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({fetch:vi.fn()}));
vi.mock('./source-http',async()=>({...await vi.importActual<typeof import('./source-http')>('./source-http'),sourceFetch:mocks.fetch}));
import {fetchWooStoreKnownBatch,parseWooStoreKnownProducts,verifyWooStoreProducts} from './woocommerce-known-batch';
const url='https://maxtecno.com.ar/producto/ram-kingston/';
const targets=[{url,category:'memoria-ram' as const}];
const at=new Date('2026-10-01T22:00:00Z');
const item={id:123,name:'Memoria RAM Kingston DDR4 16GB',permalink:url,sku:'KF432C16',type:'simple',has_options:false,is_in_stock:true,is_purchasable:true,is_on_backorder:false,
 prices:{price:'40348931',currency_code:'ARS',currency_minor_unit:2,price_range:null},stock_availability:{class:'in-stock'}};
beforeEach(()=>vi.resetAllMocks());
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
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
it('excluye precios de API de Katech después de constatar una discrepancia visible',()=>{
 expect(parseWooStoreKnownProducts([{...item,permalink:'https://katech.com.ar/producto/ram/'}],'katech',[{url:'https://katech.com.ar/producto/ram/',category:'memoria-ram'}],at)).toEqual([]);
});
it('agrupa slugs en una lectura y no inventa observaciones para publicaciones ausentes',async()=>{
 mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify([item]),{headers:{'content-type':'application/json'}})).mockResolvedValueOnce(new Response('<body class="single-product"><main class="product instock"><h1 class="product-title">Memoria RAM Kingston DDR4 16GB</h1><div class="price-showcase-box"><span class="price-main">$403.489,31</span></div></main></body>'));
 const products=await fetchWooStoreKnownBatch('maxtecno',[...targets,{url:'https://maxtecno.com.ar/producto/otra/',category:'memoria-ram'}]);
 expect(products).toHaveLength(1);expect(mocks.fetch).toHaveBeenCalledTimes(2);
 const called=new URL(mocks.fetch.mock.calls[0][1]);expect(called.searchParams.get('slug')).toBe('ram-kingston,otra');
 expect(called.searchParams.get('per_page')).toBe('100');
});
it('no realiza solicitudes para destinos de otro dominio',async()=>{
 await expect(fetchWooStoreKnownBatch('maxtecno',[{url:'https://evil.example/producto/ram/',category:'memoria-ram'}])).rejects.toThrow('invalid-response');
 expect(mocks.fetch).not.toHaveBeenCalled();
});

it('rechaza el lote si el control visible informa otro precio',async()=>{
 mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify([item]))).mockResolvedValueOnce(new Response('<body class="single-product"><main class="product instock"><h1 class="product-title">Memoria RAM Kingston DDR4 16GB</h1><div class="price-showcase-box"><span class="price-main">$500.000</span></div></main></body>'));
 await expect(fetchWooStoreKnownBatch('maxtecno',targets)).rejects.toThrow('inconsistent-source');
});

// Fragmento mínimo de Golden188718 leído14Oct15:15UTC; resto de casos sintéticos offline.
const goldenUrl='https://goldentechstore.com.ar/producto/memoria-ram-udimm-corsair-vengeance-32gb-ddr5-6000mhz-cl30-1-40v-2-x-16gb-negro-rgb/';
const goldenTarget={url:goldenUrl,category:'memoria-ram' as const};
const goldenItem={...item,id:188718,name:'Memoria Ram UDIMM CORSAIR VENGEANCE 32GB DDR5 6000MHz CL30 1.40V (2 x 16GB) Negro RGB',permalink:goldenUrl,sku:'EL_CORM5VR2X1660',prices:{...item.prices,price:'120212197'}};
const goldenHtml=`<html><head><link rel="canonical" href="${goldenUrl}"><meta property="product:price:currency" content="ARS"></head><body class="single-product"><main class="gt-ficha"><section class="gt-ficha__buy">
 <h1 class="gt-ficha__title">${goldenItem.name}</h1><div class="gt-ficha__meta"><span class="gt-ficha__pill gt-ficha__pill--blue">Disponible en 24-48 hs</span></div>
 <span class="gt-ficha__sku">SKU: EL_CORM5VR2X1660</span><span class="gt-ficha-cash__now">$ 1.202.121,97</span>
 <p class="stock in-stock"></p><button class="single_add_to_cart_button" name="add-to-cart" value="188718">Agregar al carrito</button>
 </section></main></body></html>`;
const serveGolden=(html=goldenHtml,data=[goldenItem])=>mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify(data))).mockResolvedValueOnce(new Response(html));

it('una discrepancia sólo de stock conserva una ficha HTML unknown y no aprueba otras filas ni la tienda',async()=>{
 const other={...goldenItem,id:188719,permalink:goldenUrl.replace('/memoria-ram-','/otra-memoria-')};
 serveGolden(goldenHtml,[goldenItem,other]);
 const verified=new Set<string>();
 const found=await fetchWooStoreKnownBatch('goldentechstore',[goldenTarget,{url:other.permalink,category:'memoria-ram'}],undefined,verified);
 expect(found).toHaveLength(1);
 expect(found[0].prices[0]).toMatchObject({url:goldenUrl,stock:'unknown',priceCondition:'special',price:1202122});
 expect(found[0].specs).toMatchObject({SourceListingId:'188718',SKU:'EL_CORM5VR2X1660'});
 expect(verified.has('goldentechstore')).toBe(false);expect(mocks.fetch).toHaveBeenCalledTimes(2);
 await expect(fetchWooStoreKnownBatch('goldentechstore',[goldenTarget],undefined,verified)).rejects.toThrow('inconsistent-source');
 expect(mocks.fetch).toHaveBeenCalledTimes(2);
});

it.each([
 ['título distinto',(html:string)=>html.replace(goldenItem.name,'Memoria RAM Kingston DDR4 16GB')],
 ['precio distinto',(html:string)=>html.replace('1.202.121,97','1.500.000,00')],
 ['SKU distinto',(html:string)=>html.replace('EL_CORM5VR2X1660','EL_OTHER')],
 ['ID distinto',(html:string)=>html.replace('value="188718"','value="188719"')],
 ['canonical distinto',(html:string)=>html.replace(`href="${goldenUrl}"`,'href="https://goldentechstore.com.ar/producto/otra-ram/"')],
 ['moneda distinta',(html:string)=>html.replace('content="ARS"','content="USD"')],
 ['SKU ausente',(html:string)=>html.replace('SKU: EL_CORM5VR2X1660','')],
 ['ID ausente',(html:string)=>html.replace('value="188718"','')],
])('discrepancia de %s nunca se transforma en fallback de stock',async(_,alter)=>{
 serveGolden(alter(goldenHtml));const verified=new Set<string>();
 await expect(fetchWooStoreKnownBatch('goldentechstore',[goldenTarget],undefined,verified)).rejects.toThrow('inconsistent-source');
 expect(verified.has('goldentechstore')).toBe(false);expect(mocks.fetch).toHaveBeenCalledTimes(2);
});

it('el inventario sigue rechazando la misma discrepancia sin aprobar sus registros API',async()=>{
 const api=parseWooStoreKnownProducts([goldenItem],'goldentechstore',[goldenTarget],new Date());
 mocks.fetch.mockResolvedValueOnce(new Response(goldenHtml));const verified=new Set<string>();
 await expect(verifyWooStoreProducts('goldentechstore',api,undefined,verified)).rejects.toThrow('inconsistent-source');
 expect(api[0].prices[0].stock).toBe('in-stock');expect(verified.has('goldentechstore')).toBe(false);
});

it.each([['anterior',-1000],['futura',61000]] as const)('una fecha HTML %s no crea observación de fallback',async(_,delta)=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-14T15:30:00Z'));
 vi.spyOn(Date,'now').mockReturnValue(new Date('2026-10-14T15:30:00Z').getTime());
 mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify([goldenItem]))).mockImplementationOnce(async()=>{
  vi.setSystemTime(new Date('2026-10-14T15:30:00Z').getTime()+delta);return new Response(goldenHtml);
 });
 await expect(fetchWooStoreKnownBatch('goldentechstore',[goldenTarget])).rejects.toThrow('inconsistent-source');
});

it('otra tienda conserva el rechazo de stock aunque la ficha cumpla título y precio',async()=>{
 mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify([item]))).mockResolvedValueOnce(new Response('<body class="single-product"><main class="product onbackorder"><h1 class="product-title">Memoria RAM Kingston DDR4 16GB</h1><div class="price-showcase-box"><span class="price-main">$403.489,31</span></div><p class="stock available-on-backorder">Disponible para reserva</p></main></body>'));
 await expect(fetchWooStoreKnownBatch('maxtecno',targets)).rejects.toThrow('inconsistent-source');
});

it.each(['blocked','rate-limited'] as const)('un %s conserva el fallo y no fuerza una nueva lectura HTML',async reason=>{
 const {SourceHttpError}=await import('./source-http');mocks.fetch.mockRejectedValueOnce(new SourceHttpError(reason,reason==='blocked'?403:429));
 await expect(fetchWooStoreKnownBatch('goldentechstore',[goldenTarget])).rejects.toMatchObject({reason});
 expect(mocks.fetch).toHaveBeenCalledTimes(1);
});
it.each(['blocked','rate-limited'] as const)('un %s de la ficha tampoco habilita fallback ni repite el control',async reason=>{
 const {SourceHttpError}=await import('./source-http');mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify([goldenItem])))
  .mockRejectedValueOnce(new SourceHttpError(reason,reason==='blocked'?403:429));const verified=new Set<string>();
 await expect(fetchWooStoreKnownBatch('goldentechstore',[goldenTarget],undefined,verified)).rejects.toMatchObject({reason});
 expect(verified.has('goldentechstore')).toBe(false);expect(mocks.fetch).toHaveBeenCalledTimes(2);
});
it('dos lotes simultáneos del mismo contexto nunca duplican la muestra HTML',async()=>{
 mocks.fetch.mockImplementation(async(_store:string,requested:string)=>new Response(requested.includes('/wp-json/')?JSON.stringify([goldenItem]):goldenHtml));
 const verified=new Set<string>();
 const results=await Promise.allSettled([
  fetchWooStoreKnownBatch('goldentechstore',[goldenTarget],undefined,verified),
  fetchWooStoreKnownBatch('goldentechstore',[goldenTarget],undefined,verified),
 ]);
 expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);
 expect(results.filter(result=>result.status==='rejected')).toHaveLength(1);
 expect(mocks.fetch.mock.calls.filter(([,requested])=>!String(requested).includes('/wp-json/'))).toHaveLength(1);
 expect(verified.has('goldentechstore')).toBe(false);
});
