import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { Product } from '@/lib/types';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),fetch:vi.fn(),map:vi.fn(),inventory:vi.fn(),details:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('@/lib/server/supabase-server',()=>({getServerSupabaseServiceClient:()=>({rpc:mocks.rpc,from:mocks.from})}));
vi.mock('@/lib/persistence/product-read-mapper',()=>({mapDbProduct:mocks.map}));
vi.mock('@/lib/ai/review-product-offers',()=>({reviewProductOffers:async(products:Product[])=>products}));
vi.mock('@/lib/persistence/product-write-dedupe',()=>({buildPriceStateSignature:()=> 'test'}));
vi.mock('./on-demand/worker',()=>({prepareKnownOfferBatch:async()=>{},fetchKnownOffer:mocks.fetch,createKnownOfferContext:()=>({failures:new Map(),sources:new Map(),sharedReads:0})}));
vi.mock('./inventory-discovery',()=>({runInventoryDiscovery:mocks.inventory}));
vi.mock('./inventory-detail-discovery',()=>({runInventoryDetailDiscovery:mocks.details}));
import {runAdaptiveRefresh} from './adaptive-refresh';
const target={offer_id:'offer',product_id:'cpu',store_id:'compragamer',url:'https://compragamer.com/producto/123',interval_hours:24,reason:'components'};
const price={storeId:'compragamer',storeName:'CompraGamer',url:target.url,price:100,stock:'in-stock',lastUpdated:new Date('2026-10-01T22:00:01Z')};
const product={id:'cpu',name:'AMD Ryzen 5 5600',category:'procesadores',prices:[price]} as Product;
beforeEach(()=>{
 vi.resetAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-01T22:00:00Z'));vi.stubEnv('CATALOG_REQUESTED_RUNNER','1');vi.stubEnv('CATALOG_INVENTORY_DISCOVERY','0');
 const chain={delete:()=>chain,lt:async()=>({error:null}),update:()=>chain,eq:()=>chain,then:(resolve:(value:{error:null})=>void)=>resolve({error:null}),insert:()=>chain,select:()=>chain,single:async()=>({data:{id:'run'},error:null}),in:()=>chain,limit:async()=>({data:[{}],error:null})};
 mocks.from.mockReturnValue(chain);mocks.map.mockReturnValue(product);mocks.fetch.mockResolvedValue({product,price,sourceTitle:product.name});
 mocks.rpc.mockImplementation(async(name:string)=>({error:null,data:name==='seed_catalog_refresh_queue'?0:name==='catalog_refresh_coverage'?[]:name==='claim_catalog_feed_refresh'||name==='claim_catalog_refresh'?[]:true}));
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();});
it('actualiza la fuente compartida sin consumir el presupuesto de las demás tiendas',async()=>{
 const claims:string[]=[];
 mocks.rpc.mockImplementation(async(name:string)=>{if(name.startsWith('claim_')){claims.push(name);return {data:claims.length<=2?[target]:[],error:null};}return {data:name==='seed_catalog_refresh_queue'?0:name==='catalog_refresh_coverage'?[]:true,error:null};});
 const result=await runAdaptiveRefresh({maxOffers:2});
 expect(claims).toEqual(['claim_catalog_feed_refresh','claim_catalog_refresh']);
 expect(result).toMatchObject({attempted:2,observed:2,feedClaimed:1,status:'completed'});
});
it('continúa con las demás tiendas cuando la fuente compartida no tiene ofertas pendientes',async()=>{
 const result=await runAdaptiveRefresh({maxOffers:24});
 expect(result).toMatchObject({attempted:0,feedClaimed:0,status:'completed'});
 expect(mocks.rpc.mock.calls.filter(([name])=>name.startsWith('claim_')).map(([name])=>name)).toEqual(['claim_catalog_feed_refresh','claim_catalog_refresh']);
});
it('reserva tiempo de rotación aunque las lecturas compartidas consuman pocas filas',async()=>{
 const claims:string[]=[];
 mocks.rpc.mockImplementation(async(name:string)=>{
  if(name.startsWith('claim_')){claims.push(name);return {data:claims.length===1?[target]:[],error:null};}
  return {data:name==='seed_catalog_refresh_queue'?0:name==='catalog_refresh_coverage'?[]:true,error:null};
 });
 mocks.fetch.mockImplementation(async()=>{vi.setSystemTime(new Date(Date.now()+60_000));return {product,price,sourceTitle:product.name};});
 const result=await runAdaptiveRefresh({maxOffers:200,maxRunMs:100_000});
 expect(claims).toEqual(['claim_catalog_feed_refresh','claim_catalog_refresh']);
 expect(result).toMatchObject({feedClaimed:1,phaseMs:{shared:60_000},sourceHttp:{}});
});
it('no renueva la oferta ni cuenta observaciones cuando el guardado es rechazado',async()=>{
 let claimed=false;
 mocks.rpc.mockImplementation(async(name:string)=>{if(name==='claim_catalog_feed_refresh')return {data:claimed?[]:(claimed=true,[target]),error:null};return {data:name==='persist_adaptive_offer'?false:name==='seed_catalog_refresh_queue'?0:name==='catalog_refresh_coverage'?[]:name==='claim_catalog_refresh'?[]:true,error:null};});
 expect(await runAdaptiveRefresh({maxOffers:2})).toMatchObject({observed:0,failures:{'persist-failed':1},status:'failed'});
});
it('registra el motivo operativo y libera leases ante una falla de lectura',async()=>{
 mocks.rpc.mockImplementation(async(name:string)=>({data:name==='seed_catalog_refresh_queue'?0:name==='catalog_refresh_coverage'?[]:true,error:name==='claim_catalog_feed_refresh'?{code:'db'}:null}));
 expect(await runAdaptiveRefresh({maxOffers:24})).toMatchObject({status:'failed',failureCode:'REFRESH_CLAIM_FAILED'});
 expect(mocks.from).toHaveBeenCalledWith('catalog_offer_refresh_state');
});
it('reintenta una confirmación de respuesta perdida sin contar la oferta dos veces',async()=>{
 let claimed=false,finishes=0;
 mocks.rpc.mockImplementation(async(name:string)=>{
  if(name==='claim_catalog_feed_refresh')return {data:claimed?[]:(claimed=true,[target]),error:null};
  if(name==='finish_catalog_refresh' && ++finishes===1)return {data:null,error:{code:'NETWORK'}};
  return {data:name==='seed_catalog_refresh_queue'?0:name==='catalog_refresh_coverage'?[]:name==='claim_catalog_refresh'?[]:true,error:null};
 });
 const promise=runAdaptiveRefresh({maxOffers:2});await vi.runAllTimersAsync();
 expect(await promise).toMatchObject({attempted:1,observed:1,status:'completed'});expect(finishes).toBe(2);
});
it('reintenta la misma observación ante un fallo temporal de guardado',async()=>{
 let claimed=false,persists=0;
 mocks.rpc.mockImplementation(async(name:string)=>{
  if(name==='claim_catalog_feed_refresh')return {data:claimed?[]:(claimed=true,[target]),error:null};
  if(name==='persist_adaptive_offer' && ++persists===1)return {data:null,error:{code:'NETWORK'}};
  return {data:name==='seed_catalog_refresh_queue'?0:name==='catalog_refresh_coverage'?[]:name==='claim_catalog_refresh'?[]:true,error:null};
 });
 const promise=runAdaptiveRefresh({maxOffers:2});await vi.runAllTimersAsync();
 expect(await promise).toMatchObject({attempted:1,observed:1,status:'completed'});
 const calls=mocks.rpc.mock.calls.filter(([name])=>name==='persist_adaptive_offer');expect(calls).toHaveLength(2);expect(calls[0][1]).toEqual(calls[1][1]);
});
it('prepara todas las altas en lotes antes de reclamar ofertas',async()=>{
 let seeded=0;
 mocks.rpc.mockImplementation(async(name:string)=>({data:name==='seed_catalog_refresh_queue'?[500,12,0][seeded++]:name==='catalog_refresh_coverage'?[]:name.startsWith('claim_')?[]:true,error:null}));
 expect(await runAdaptiveRefresh({maxOffers:24})).toMatchObject({seeded:512,status:'completed'});
 expect(mocks.rpc.mock.calls.filter(([name])=>name==='seed_catalog_refresh_queue')).toHaveLength(3);
});
it('rechaza una respuesta de preparación ilegible antes de reservar destinos',async()=>{
 mocks.rpc.mockResolvedValue({data:'500',error:null});
 expect(await runAdaptiveRefresh({maxOffers:24})).toMatchObject({status:'failed',failureCode:'REFRESH_INVALID_SEED_RESULT',attempted:0});
 expect(mocks.rpc.mock.calls.some(([name])=>name.startsWith('claim_'))).toBe(false);
});
it('recupera una preparación temporalmente interrumpida antes de reclamar destinos',async()=>{
 let seeds=0;
 mocks.rpc.mockImplementation(async(name:string)=>({data:name==='seed_catalog_refresh_queue'?0:name==='catalog_refresh_coverage'?[]:[],error:name==='seed_catalog_refresh_queue' && ++seeds===1?{code:'57014'}:null}));
 const promise=runAdaptiveRefresh({maxOffers:24});await vi.runAllTimersAsync();
 expect(await promise).toMatchObject({status:'completed',seeded:0});expect(seeds).toBe(2);
});
it('identifica el timeout persistente sin reservar destinos ni revelar la respuesta externa',async()=>{
 mocks.rpc.mockResolvedValue({data:null,error:{code:'57014',message:'respuesta privada'}});
 const promise=runAdaptiveRefresh({maxOffers:24});await vi.runAllTimersAsync();
 expect(await promise).toMatchObject({status:'failed',failureCode:'REFRESH_SEED_TIMEOUT',attempted:0,observed:0});
 expect(mocks.rpc.mock.calls.filter(([name])=>name==='seed_catalog_refresh_queue')).toHaveLength(3);expect(mocks.rpc.mock.calls.some(([name])=>name.startsWith('claim_'))).toBe(false);
 expect(mocks.from).toHaveBeenCalledWith('catalog_refresh_runs');
});
it('conserva las altas del inventario y detalle aunque falle después la preparación',async()=>{
 vi.stubEnv('CATALOG_INVENTORY_DISCOVERY','1');
 const inventory=[{storeId:'maxtecno',status:'completed',imported:4}],details={status:'completed',attempted:2,imported:2,failures:0};
 mocks.inventory.mockResolvedValue(inventory);mocks.details.mockResolvedValue(details);
 mocks.rpc.mockImplementation(async(name:string)=>({data:name==='seed_catalog_refresh_queue'?'invalid':[],error:null}));
 expect(await runAdaptiveRefresh({maxOffers:24})).toMatchObject({status:'failed',failureCode:'REFRESH_INVALID_SEED_RESULT',inventory,inventoryDetails:details,attempted:0});
 expect(mocks.from.mock.invocationCallOrder[0]).toBeLessThan(mocks.inventory.mock.invocationCallOrder[0]);
});

function observeLeaseRelease() {
  const originalFrom = mocks.from.getMockImplementation()!;
  const eq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq });
  mocks.from.mockImplementation((table: string) => table === 'catalog_offer_refresh_state'
    ? { update } : originalFrom(table));
  return { update, eq };
}

it.each(['57014', '40P01'])('diagnostica %s en la primera rotación y conserva la observación previa', async (code) => {
  const release = observeLeaseRelease();
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === 'claim_catalog_feed_refresh') return { data: [target], error: null };
    if (name === 'claim_catalog_refresh') {
      vi.setSystemTime(new Date(Date.now() + 8500));
      return { data: null, error: { code, message: 'secret-marker', details: 'private SQL', hint: target.url, token: 'secret-marker' } };
    }
    return { data: name === 'seed_catalog_refresh_queue' ? 0 : name === 'catalog_refresh_coverage' ? [] : true, error: null };
  });
  const result = await runAdaptiveRefresh({ maxOffers: 2 });
  expect(result).toMatchObject({
    status: 'failed', failureCode: 'REFRESH_CLAIM_FAILED', attempted: 1, observed: 1, comparable: 1, feedClaimed: 1,
    groups: { 'compragamer:components': { attempted: 1, observed: 1, comparable: 1 } },
    claimDiagnostic: { rpc: 'claim_catalog_refresh', phase: 'rotation', batchIndex: 2, limit: 1, elapsedMs: 8500, code },
  });
  expect(mocks.rpc.mock.calls.filter(([name]) => name.startsWith('claim_')).map(([name]) => name))
    .toEqual(['claim_catalog_feed_refresh', 'claim_catalog_refresh']);
  expect(mocks.rpc.mock.calls.filter(([name]) => name === 'persist_adaptive_offer')).toHaveLength(1);
  expect(JSON.stringify(result)).not.toMatch(/secret-marker|private SQL|hint|token/);
  expect(release.update).toHaveBeenCalledWith({ lease_token: null, leased_until: null });
  expect(release.eq).toHaveBeenCalledWith('lease_token', expect.any(String));
});

it.each(['response', 'exception'])('diagnostica un fallo shared vía %s sin reintentar ni copiar texto externo', async (mode) => {
  const release = observeLeaseRelease();
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === 'claim_catalog_feed_refresh') {
      vi.setSystemTime(new Date(Date.now() + 40));
      const error = { code: mode === 'response' ? 'PGRST202' : 'private-token', message: target.url, details: 'secret-marker', args: { token: 'secret-marker' } };
      if (mode === 'exception') throw error;
      return { data: null, error };
    }
    return { data: name === 'seed_catalog_refresh_queue' ? 0 : name === 'catalog_refresh_coverage' ? [] : true, error: null };
  });
  const result = await runAdaptiveRefresh({ maxOffers: 24 });
  expect(result).toMatchObject({ status: 'failed', failureCode: 'REFRESH_CLAIM_FAILED', attempted: 0, observed: 0,
    claimDiagnostic: { rpc: 'claim_catalog_feed_refresh', phase: 'shared', batchIndex: 1, limit: 12, elapsedMs: 40,
      code: mode === 'response' ? 'PGRST202' : null } });
  expect(mocks.rpc.mock.calls.filter(([name]) => name.startsWith('claim_'))).toHaveLength(1);
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(release.update).toHaveBeenCalledWith({ lease_token: null, leased_until: null });
  expect(release.eq).toHaveBeenCalledWith('lease_token', expect.any(String));
  expect(JSON.stringify(result)).not.toMatch(/private-token|secret-marker|compragamer.com|details|args/);
});

it('identifica el lote 51 al fallar la rotación después de 1200 ofertas compartidas', async () => {
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === 'claim_catalog_feed_refresh') return { data: Array.from({ length: 24 }, () => target), error: null };
    if (name === 'claim_catalog_refresh') return { data: null, error: { code: '57014' } };
    return { data: name === 'seed_catalog_refresh_queue' ? 0 : name === 'catalog_refresh_coverage' ? [] : true, error: null };
  });
  const result = await runAdaptiveRefresh({ maxOffers: 2500 });
  expect(result).toMatchObject({ failureCode: 'REFRESH_CLAIM_FAILED', attempted: 1200, observed: 1200, feedClaimed: 1200,
    claimDiagnostic: { rpc: 'claim_catalog_refresh', phase: 'rotation', batchIndex: 51, limit: 48, elapsedMs: 0, code: '57014' } });
  expect(mocks.rpc.mock.calls.filter(([name]) => name === 'claim_catalog_refresh')).toHaveLength(1);
});

it.each([
  ['release', 'response'], ['release', 'rejection'], ['coverage', 'response'],
  ['coverage', 'rejection'], ['progress', 'response'], ['progress', 'rejection'],
])('conserva el claim y acumulados cuando el cierre %s falla por %s', async (stage, mode) => {
  const raw = { message: 'PRIVATE_CREDENTIAL', details: 'private SQL', hint: target.url };
  const failingResponse = async () => {
    if (mode === 'rejection') throw raw;
    return { data: null, error: raw };
  };
  const originalFrom = mocks.from.getMockImplementation()!;
  const release = vi.fn(async () => stage === 'release' ? failingResponse() : { error: null });
  const finalUpdate = vi.fn(async () => stage === 'progress' ? failingResponse() : { error: null });
  mocks.from.mockImplementation((table: string) => {
    if (table === 'catalog_offer_refresh_state') return { update: () => ({ eq: release }) };
    const chain = originalFrom(table);
    return { ...chain, update: (payload: { summary?: unknown; finished_at?: string }) =>
      payload.summary && payload.finished_at ? { eq: finalUpdate } : chain.update(payload) };
  });
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === 'claim_catalog_feed_refresh') return { data: [target], error: null };
    if (name === 'claim_catalog_refresh') return { data: null, error: { code: '57014' } };
    if (name === 'catalog_refresh_coverage') return stage === 'coverage' ? failingResponse()
      : { data: [{ total: 5, observed_24h: 1 }], error: null };
    return { data: name === 'seed_catalog_refresh_queue' ? 0 : true, error: null };
  });
  const result = await runAdaptiveRefresh({ maxOffers: 2 });
  expect(result).toMatchObject({ status: 'failed', failureCode: 'REFRESH_CLAIM_FAILED', attempted: 1,
    observed: 1, comparable: 1, feedClaimed: 1, groups: { 'compragamer:components': { observed: 1 } },
    claimDiagnostic: { rpc: 'claim_catalog_refresh', phase: 'rotation', batchIndex: 2, code: '57014' },
    closure: { failureCodes: [`REFRESH_${stage.toUpperCase()}_FAILED`],
      // Confirmado significa ACK del update; no es una lectura posterior del commit.
      summaryPersistence: stage === 'progress' ? 'unconfirmed' : 'confirmed' } });
  expect(result.coverage).toEqual(stage === 'coverage' ? null : [{ total: 5, observed_24h: 1 }]);
  expect(release).toHaveBeenCalledTimes(1);
  expect(release).toHaveBeenCalledWith('lease_token', expect.any(String));
  expect(finalUpdate).toHaveBeenCalledTimes(1);
  expect(mocks.rpc.mock.calls.filter(([name]) => name === 'catalog_refresh_coverage')).toHaveLength(1);
  expect(mocks.rpc.mock.calls.filter(([name]) => name.startsWith('claim_'))).toHaveLength(2);
  expect(JSON.stringify(result)).not.toContain(raw.message);
  expect(JSON.stringify(result)).not.toContain(raw.details);
  expect(JSON.stringify(result)).not.toContain(raw.hint);
});

it('mide tres cancelaciones seed y las esperas sin contaminar el artefacto', async () => {
  const times: number[] = [];
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === 'seed_catalog_refresh_queue') {
      times.push(Date.now());
      vi.setSystemTime(new Date(Date.now() + 8000));
      return { data: null, error: { code: '57014', message: 'PRIVATE_CREDENTIAL', details: 'SQL', url: target.url } };
    }
    return { data: [], error: null };
  });
  const promise = runAdaptiveRefresh();
  await vi.runAllTimersAsync();
  const result = await promise;
  expect(result).toMatchObject({ status: 'failed', failureCode: 'REFRESH_SEED_TIMEOUT', seeded: 0,
    attempted: 0, observed: 0, comparable: 0, phaseMs: { preparation: 25500 },
    seedDiagnostic: { attempts: [1, 2, 3].map(attemptIndex => ({ rpc: 'seed_catalog_refresh_queue',
      phase: 'preparation', batchIndex: 1, attemptIndex, elapsedMs: 8000, code: '57014' })) } });
  expect(times.map(time => time - times[0])).toEqual([0, 8500, 17500]);
  expect(mocks.rpc.mock.calls.some(([name]) => name.startsWith('claim_'))).toBe(false);
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE_CREDENTIAL|SQL|compragamer.com/);
});

it('conserva contador y diagnóstico de éxito después de un retry seed', async () => {
  let seeds = 0;
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === 'seed_catalog_refresh_queue') {
      vi.setSystemTime(new Date(Date.now() + 10));
      const error = ++seeds === 2 ? { code: '57014' } : null;
      return { data: seeds === 1 ? 500 : error ? null : 0, error };
    }
    return { data: [], error: null };
  });
  const promise = runAdaptiveRefresh();
  await vi.runAllTimersAsync();
  const result = await promise;
  expect(result).toMatchObject({ status: 'completed', seeded: 500, phaseMs: { preparation: 530 },
    seedDiagnostic: { attempts: [
      { batchIndex: 2, attemptIndex: 1, elapsedMs: 10, code: '57014' },
      { batchIndex: 2, attemptIndex: 2, elapsedMs: 10, code: null },
    ] } });
  expect(result.seedDiagnostic?.attempts).toHaveLength(2);
  expect(seeds).toBe(3);
  expect(result.claimDiagnostic).toBeUndefined();
});

it.each([undefined, '57014', 'SECRET_URL'])('captura rechazo seed con código %j sin añadir retries', async (code) => {
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === 'seed_catalog_refresh_queue') {
      vi.setSystemTime(new Date(Date.now() + 35));
      throw { code, message: 'PRIVATE_CREDENTIAL', hint: target.url };
    }
    return { data: [], error: null };
  });
  const result = await runAdaptiveRefresh();
  expect(result).toMatchObject({ failureCode: 'REFRESH_UNEXPECTED_ERROR', status: 'failed',
    phaseMs: { preparation: 35 }, seedDiagnostic: { attempts: [{
      batchIndex: 1, attemptIndex: 1, elapsedMs: 35, code: code === '57014' ? code : null,
    }] } });
  expect(mocks.rpc.mock.calls.filter(([name]) => name === 'seed_catalog_refresh_queue')).toHaveLength(1);
  expect(JSON.stringify(result)).not.toMatch(/SECRET_URL|PRIVATE_CREDENTIAL|compragamer.com/);
});

it('mantiene el deadline seed y retiene el último lote confirmado', async () => {
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === 'seed_catalog_refresh_queue') {
      vi.setSystemTime(new Date(Date.now() + 1000));
      return { data: 500, error: null };
    }
    return { data: [], error: null };
  });
  const result = await runAdaptiveRefresh({ maxRunMs: 1000 });
  expect(result).toMatchObject({ failureCode: 'REFRESH_SEED_DEADLINE', seeded: 500,
    phaseMs: { preparation: 1000 }, seedDiagnostic: { attempts: [{ batchIndex: 1, attemptIndex: 1 }] } });
  expect(mocks.rpc.mock.calls.filter(([name]) => name === 'seed_catalog_refresh_queue')).toHaveLength(1);
});

it.each([
  ['release', 'response'], ['release', 'rejection'], ['coverage', 'response'],
  ['coverage', 'rejection'], ['progress', 'response'], ['progress', 'rejection'],
])('conserva seed y acumulados cuando el cierre %s falla por %s', async (stage, mode) => {
  const raw = { message: 'PRIVATE_CREDENTIAL', details: 'private SQL', hint: target.url };
  const failure = async () => {
    if (mode === 'rejection') throw raw;
    return { error: raw, data: null };
  };
  const originalFrom = mocks.from.getMockImplementation()!;
  const update = vi.fn(async () => stage === 'progress' ? failure() : { error: null });
  const release = vi.fn(async () => stage === 'release' ? failure() : { error: null });
  mocks.from.mockImplementation((table: string) => {
    if (table === 'catalog_offer_refresh_state') return { update: () => ({ eq: release }) };
    const chain = originalFrom(table);
    return { ...chain, update: (payload: { summary?: unknown }) =>
      payload.summary ? { eq: update } : chain.update(payload) };
  });
  let seeds = 0;
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === 'seed_catalog_refresh_queue') {
      vi.setSystemTime(new Date(Date.now() + 10));
      return ++seeds === 1 ? { data: 500, error: null } : { data: null, error: { code: '57014', ...raw } };
    }
    return stage === 'coverage' ? failure() : { data: [{ total: 500 }], error: null };
  });
  const promise = runAdaptiveRefresh();
  await vi.runAllTimersAsync();
  const result = await promise;
  expect(result).toMatchObject({ status: 'failed', failureCode: 'REFRESH_SEED_TIMEOUT', seeded: 500,
    attempted: 0, observed: 0, comparable: 0, phaseMs: { preparation: 1540 },
    closure: { failureCodes: [`REFRESH_${stage.toUpperCase()}_FAILED`],
      summaryPersistence: stage === 'progress' ? 'unconfirmed' : 'confirmed' } });
  expect(result.seedDiagnostic?.attempts).toEqual([1, 2, 3].map(attemptIndex => ({
    rpc: 'seed_catalog_refresh_queue', phase: 'preparation', batchIndex: 2,
    attemptIndex, elapsedMs: 10, code: '57014',
  })));
  expect(result.coverage).toEqual(stage === 'coverage' ? null : [{ total: 500 }]);
  expect(update).toHaveBeenCalledTimes(1);
  expect(release).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE_CREDENTIAL|private SQL|compragamer.com/);
  expect(mocks.rpc.mock.calls.some(([name]) => name.startsWith('claim_'))).toBe(false);
});

function rotationTargets(stores: string[]) {
  return stores.map((store, index) => ({ ...target, offer_id: `offer-${index}`, store_id: store, url: `https://${store}.example/p/${index}` }));
}
function serveRotation(batch: typeof target[]) {
  let served = false;
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === 'claim_catalog_refresh') return { data: served ? [] : (served = true, batch), error: null };
    if (name === 'claim_catalog_feed_refresh') return { data: [], error: null };
    return { data: name === 'seed_catalog_refresh_queue' ? 0 : name === 'catalog_refresh_coverage' ? [] : true, error: null };
  });
}
function recordFetches(durationMs: number) {
  const spans: { store: string; start: number; end: number }[] = [];
  mocks.fetch.mockImplementation(async (_product: Product, request: { storeId: string; url: string }) => {
    const span = { store: request.storeId, start: Date.now(), end: 0 };
    spans.push(span);
    await new Promise(resolve => setTimeout(resolve, durationMs));
    span.end = Date.now();
    return { product, price: { ...price, storeId: request.storeId, url: request.url }, sourceTitle: product.name };
  });
  return spans;
}

it('espacia 2000 ms la misma tienda sin superponer y superpone tiendas distintas', async () => {
  serveRotation(rotationTargets(['mexx', 'mexx', 'mexx', 'venex', 'fullh4rd']));
  const spans = recordFetches(500);
  const promise = runAdaptiveRefresh({ maxOffers: 24 });
  await vi.runAllTimersAsync();
  expect(await promise).toMatchObject({ attempted: 5, observed: 5, status: 'completed' });
  const mexx = spans.filter(span => span.store === 'mexx');
  expect(mexx).toHaveLength(3);
  for (let index = 1; index < mexx.length; index++) expect(mexx[index].start - mexx[index - 1].end).toBeGreaterThanOrEqual(2000);
  const origin = mexx[0].start;
  expect(spans.find(span => span.store === 'venex')!.start).toBe(origin);
  expect(spans.find(span => span.store === 'fullh4rd')!.start).toBe(origin);
});

it('usa hasta ocho solicitudes simultáneas entre tiendas distintas', async () => {
  serveRotation(rotationTargets(Array.from({ length: 12 }, (_, index) => `store-${index}`)));
  let running = 0, peak = 0;
  mocks.fetch.mockImplementation(async (_product: Product, request: { storeId: string; url: string }) => {
    running++; peak = Math.max(peak, running);
    await new Promise(resolve => setTimeout(resolve, 300));
    running--;
    return { product, price: { ...price, storeId: request.storeId, url: request.url }, sourceTitle: product.name };
  });
  const promise = runAdaptiveRefresh({ maxOffers: 24 });
  await vi.runAllTimersAsync();
  expect(await promise).toMatchObject({ attempted: 12, observed: 12 });
  expect(peak).toBe(8);
});

it('no inicia lecturas después del deadline y deja sin cerrar las ofertas pendientes', async () => {
  const release = observeLeaseRelease();
  serveRotation(rotationTargets(['mexx', 'mexx', 'mexx', 'mexx']));
  const spans = recordFetches(500);
  const started = Date.now();
  const promise = runAdaptiveRefresh({ maxOffers: 24, maxRunMs: 5000 });
  await vi.runAllTimersAsync();
  const result = await promise;
  expect(spans.map(span => span.start - started)).toEqual([0, 2500]);
  expect(result).toMatchObject({ attempted: 2, observed: 2, status: 'deadline' });
  expect(mocks.rpc.mock.calls.filter(([name]) => name === 'finish_catalog_refresh')).toHaveLength(2);
  expect(release.update).toHaveBeenCalledWith({ lease_token: null, leased_until: null });
});

it('difiere sin fallo ni backoff las ofertas de una tienda que queda pausada por 429', async () => {
  const release = observeLeaseRelease();
  serveRotation(rotationTargets(['mexx-paused', 'mexx-paused', 'mexx-paused', 'venex']));
  const requested: string[] = [];
  mocks.fetch.mockImplementation(async (_product: Product, request: { storeId: string; url: string }, _started: number, context: { failures: Map<string, string> }) => {
    requested.push(request.storeId);
    if (request.storeId === 'mexx-paused') { context.failures.set(request.url, 'rate-limited'); return null; }
    return { product, price: { ...price, storeId: request.storeId, url: request.url }, sourceTitle: product.name };
  });
  const promise = runAdaptiveRefresh({ maxOffers: 24 });
  await vi.runAllTimersAsync();
  const result = await promise;
  expect(requested.sort()).toEqual(['mexx-paused', 'venex']);
  expect(result).toMatchObject({ attempted: 2, observed: 1, failures: { 'source-failed': 1 }, deferred: 2, deferredStores: { 'mexx-paused': 2 } });
  const finished = mocks.rpc.mock.calls.filter(([name]) => name === 'finish_catalog_refresh').map(([, args]) => args.p_offer_id);
  expect(finished.sort()).toEqual(['offer-0', 'offer-3']);
  expect(release.update).toHaveBeenCalledWith({ lease_token: null, leased_until: null });
});

it('no consulta una tienda que ya estaba pausada por el transporte al iniciar el lote', async () => {
  const { sourceFetch } = await import('@/lib/scrapers/source-http');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 429, headers: { 'Retry-After': '600' } })));
  await expect(sourceFetch('pre-paused', 'https://pre-paused.example/x')).rejects.toMatchObject({ reason: 'rate-limited' });
  vi.unstubAllGlobals();
  serveRotation(rotationTargets(['pre-paused', 'pre-paused', 'venex']));
  const spans = recordFetches(100);
  const promise = runAdaptiveRefresh({ maxOffers: 24 });
  await vi.runAllTimersAsync();
  expect(await promise).toMatchObject({ attempted: 1, observed: 1, deferred: 2, deferredStores: { 'pre-paused': 2 }, status: 'completed' });
  expect(spans.map(span => span.store)).toEqual(['venex']);
});
