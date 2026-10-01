import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { Product } from '@/lib/types';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),fetch:vi.fn(),map:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('@/lib/server/supabase-server',()=>({getServerSupabaseServiceClient:()=>({rpc:mocks.rpc,from:mocks.from})}));
vi.mock('@/lib/persistence/product-read-mapper',()=>({mapDbProduct:mocks.map}));
vi.mock('@/lib/ai/review-product-offers',()=>({reviewProductOffers:async(products:Product[])=>products}));
vi.mock('@/lib/persistence/product-write-dedupe',()=>({buildPriceStateSignature:()=> 'test'}));
vi.mock('./on-demand/worker',()=>({prepareKnownOfferBatch:async()=>{},fetchKnownOffer:mocks.fetch,createKnownOfferContext:()=>({failures:new Map(),sources:new Map(),sharedReads:0})}));
import {runAdaptiveRefresh} from './adaptive-refresh';
const target={offer_id:'offer',product_id:'cpu',store_id:'compragamer',url:'https://compragamer.com/producto/123',interval_hours:24,reason:'components'};
const price={storeId:'compragamer',storeName:'CompraGamer',url:target.url,price:100,stock:'in-stock',lastUpdated:new Date('2026-10-01T22:00:01Z')};
const product={id:'cpu',name:'AMD Ryzen 5 5600',category:'procesadores',prices:[price]} as Product;
beforeEach(()=>{
 vi.resetAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-01T22:00:00Z'));vi.stubEnv('CATALOG_REQUESTED_RUNNER','1');
 const chain={delete:()=>chain,lt:async()=>({error:null}),update:()=>chain,eq:()=>chain,then:(resolve:(value:{error:null})=>void)=>resolve({error:null}),insert:()=>chain,select:()=>chain,single:async()=>({data:{id:'run'},error:null}),in:()=>chain,limit:async()=>({data:[{}],error:null})};
 mocks.from.mockReturnValue(chain);mocks.map.mockReturnValue(product);mocks.fetch.mockResolvedValue({product,price,sourceTitle:product.name});
 mocks.rpc.mockImplementation(async(name:string)=>({error:null,data:name==='catalog_refresh_coverage'?[]:name==='claim_catalog_feed_refresh'||name==='claim_catalog_refresh'?[]:true}));
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();});
it('actualiza la fuente compartida sin consumir el presupuesto de las demás tiendas',async()=>{
 const claims:string[]=[];
 mocks.rpc.mockImplementation(async(name:string)=>{if(name.startsWith('claim_')){claims.push(name);return {data:claims.length<=2?[target]:[],error:null};}return {data:name==='catalog_refresh_coverage'?[]:true,error:null};});
 const result=await runAdaptiveRefresh({maxOffers:2});
 expect(claims).toEqual(['claim_catalog_feed_refresh','claim_catalog_refresh']);
 expect(result).toMatchObject({attempted:2,observed:2,feedClaimed:1,status:'completed'});
});
it('continúa con las demás tiendas cuando la fuente compartida no tiene ofertas pendientes',async()=>{
 const result=await runAdaptiveRefresh({maxOffers:24});
 expect(result).toMatchObject({attempted:0,feedClaimed:0,status:'completed'});
 expect(mocks.rpc.mock.calls.filter(([name])=>name.startsWith('claim_')).map(([name])=>name)).toEqual(['claim_catalog_feed_refresh','claim_catalog_refresh']);
});
it('no renueva la oferta ni cuenta observaciones cuando el guardado es rechazado',async()=>{
 let claimed=false;
 mocks.rpc.mockImplementation(async(name:string)=>{if(name==='claim_catalog_feed_refresh')return {data:claimed?[]:(claimed=true,[target]),error:null};return {data:name==='persist_adaptive_offer'?false:name==='catalog_refresh_coverage'?[]:name==='claim_catalog_refresh'?[]:true,error:null};});
 expect(await runAdaptiveRefresh({maxOffers:2})).toMatchObject({observed:0,failures:{'persist-failed':1},status:'failed'});
});
it('registra el motivo operativo y libera leases ante una falla de lectura',async()=>{
 mocks.rpc.mockImplementation(async(name:string)=>({data:name==='catalog_refresh_coverage'?[]:true,error:name==='claim_catalog_feed_refresh'?{code:'db'}:null}));
 expect(await runAdaptiveRefresh({maxOffers:24})).toMatchObject({status:'failed',failureCode:'REFRESH_CLAIM_FAILED'});
 expect(mocks.from).toHaveBeenCalledWith('catalog_offer_refresh_state');
});
it('reintenta una confirmación de respuesta perdida sin contar la oferta dos veces',async()=>{
 let claimed=false,finishes=0;
 mocks.rpc.mockImplementation(async(name:string)=>{
  if(name==='claim_catalog_feed_refresh')return {data:claimed?[]:(claimed=true,[target]),error:null};
  if(name==='finish_catalog_refresh' && ++finishes===1)return {data:null,error:{code:'NETWORK'}};
  return {data:name==='catalog_refresh_coverage'?[]:name==='claim_catalog_refresh'?[]:true,error:null};
 });
 const promise=runAdaptiveRefresh({maxOffers:2});await vi.runAllTimersAsync();
 expect(await promise).toMatchObject({attempted:1,observed:1,status:'completed'});expect(finishes).toBe(2);
});
it('reintenta la misma observación ante un fallo temporal de guardado',async()=>{
 let claimed=false,persists=0;
 mocks.rpc.mockImplementation(async(name:string)=>{
  if(name==='claim_catalog_feed_refresh')return {data:claimed?[]:(claimed=true,[target]),error:null};
  if(name==='persist_adaptive_offer' && ++persists===1)return {data:null,error:{code:'NETWORK'}};
  return {data:name==='catalog_refresh_coverage'?[]:name==='claim_catalog_refresh'?[]:true,error:null};
 });
 const promise=runAdaptiveRefresh({maxOffers:2});await vi.runAllTimersAsync();
 expect(await promise).toMatchObject({attempted:1,observed:1,status:'completed'});
 const calls=mocks.rpc.mock.calls.filter(([name])=>name==='persist_adaptive_offer');expect(calls).toHaveLength(2);expect(calls[0][1]).toEqual(calls[1][1]);
});
