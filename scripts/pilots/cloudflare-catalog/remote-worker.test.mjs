import test from 'node:test';
import assert from 'node:assert/strict';
import { createRemoteWorker } from './remote-worker.mjs';
const env = { PILOT_ENABLED: '1', PILOT_EXPIRES_AT: '2026-10-11T15:00:00Z', PILOT_ACCESS_TOKEN: 'test-only' };
const request = (path, token = 'test-only') => new Request(`https://isolated.test${path}`, { headers: { Authorization: `Bearer ${token}` } });
test('piloto deshabilitado, vencido o sin autenticación nunca lee la base', async () => {
  const worker = createRemoteWorker({ now: () => Date.parse('2026-10-11T14:00:00Z'), worker: { fetch() { assert.fail('no debe leer'); } } });
  assert.equal((await worker.fetch(request('/api/search'), { ...env, PILOT_ENABLED: '0' })).status, 503);
  assert.equal((await worker.fetch(request('/api/search'), { ...env, PILOT_EXPIRES_AT: 'invalid' })).status, 503);
  assert.equal((await worker.fetch(request('/api/search'), { ...env, PILOT_EXPIRES_AT: '2026-10-11T13:00:00Z' })).status, 503);
  assert.equal((await worker.fetch(request('/api/search', 'wrong'), env)).status, 401);
});
test('límites y noindex preservan contenido autorizado', async () => {
  const worker = createRemoteWorker({ now: () => Date.parse('2026-10-11T14:00:00Z'), worker: { fetch() { return new Response('sample', { headers: { 'X-Pilot-D1-Rows-Read': '1' } }); } } });
  assert.equal((await worker.fetch(request('/api/search?pageSize=100'), env)).status, 400);
  const response = await worker.fetch(request('/api/search?q=RTX'), env);
  assert.equal(await response.text(), 'sample');
  assert.equal(response.headers.get('X-Pilot-D1-Rows-Read'), '1');
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
});
test('estado de recuperación exige autenticación y devuelve sólo marcador con consumo medido',async()=>{
  let calls=0;
  const worker=createRemoteWorker({now:()=>Date.parse('2026-10-11T14:00:00Z')});
  const db={prepare(sql){assert.equal(sql,"SELECT value FROM pilot_meta WHERE key='snapshot'");return {bind(){return {all:async()=>{calls++;return {success:true,results:[{value:'public-marker'}],meta:{rows_read:1,rows_written:0}};}};}};}};
  assert.equal((await worker.fetch(request('/api/pilot/state','wrong'),{...env,CATALOG_DB:db})).status,401);
  assert.equal(calls,0);
  assert.equal((await worker.fetch(request('/api/pilot/state'),{...env,PILOT_ENABLED:'0',CATALOG_DB:db})).status,503);
  assert.equal(calls,0);
  const response=await worker.fetch(request('/api/pilot/state'),{...env,CATALOG_DB:db});
  assert.deepEqual(await response.json(),{snapshot:'public-marker',rowsRead:1,rowsWritten:0});assert.equal(calls,1);
  assert.equal(response.headers.get('Cache-Control'),'no-store');
});

test('endpoint clock opt-in requiere capacidad/presupuesto explícitos sin tocar DB por omisión',async()=>{
 const worker=createRemoteWorker({now:()=>Date.parse('2026-10-11T14:00:00Z'),worker:{fetch(){assert.fail('sin respaldo');}}});
 const request=()=>new Request('https://isolated.test/api/pilot/clock-sync',{method:'POST',headers:{Authorization:'Bearer test-only'},body:'{}'});
 for(const configuration of [{},{PILOT_CLOCK_SYNC_ENABLED:'1'},{PILOT_CLOCK_SYNC_ENABLED:'1',PILOT_CLOCK_SYNC_MAX_ROWS_WRITTEN:'20001'}]){
  const response=await worker.fetch(request(),{...env,...configuration,CATALOG_DB:{prepare(){assert.fail('sin DB');}}});
  assert.equal(response.status,404);assert.equal((await response.json()).error,'PILOT_CLOCK_SYNC_DISABLED');
 }
 assert.equal((await worker.fetch(new Request('https://isolated.test/api/pilot/clock-sync',{method:'POST',body:'{}'}),env)).status,401);
});
test('endpoint clock rechaza certificados y cuerpos de1MiB antes del batch',async()=>{
 const worker=createRemoteWorker({now:()=>Date.parse('2026-10-11T14:00:00Z')});
 const enabled={...env,PILOT_CLOCK_SYNC_ENABLED:'1',PILOT_CLOCK_SYNC_MAX_ROWS_WRITTEN:'20000'};
 const make=body=>new Request('https://isolated.test/api/pilot/clock-sync',{method:'POST',headers:{Authorization:'Bearer test-only'},body});
 for(const key of ['prepared_views','clock_observations']){
  const db={prepare(){return{bind(){return{all:async()=>({success:true,results:[{value:JSON.stringify({[key]:{version:1}})}],meta:{rows_read:1}})}}}},batch(){assert.fail('sin batch');}};
  const response=await worker.fetch(make('{}'),{...enabled,CATALOG_DB:db});assert.equal(response.status,409);assert.equal((await response.json()).error,'PILOT_CLOCK_CERTIFICATE_UNSUPPORTED');
 }
 const response=await worker.fetch(make('x'.repeat(1024*1024+1)),{...enabled,CATALOG_DB:{prepare(){assert.fail('sin DB');}}});assert.equal(response.status,413);
});

test('estado del certificado que cruza vencimiento impide clock batch',async()=>{
 let time=Date.parse('2026-10-11T14:00:00Z');
 const worker=createRemoteWorker({now:()=>time});
 const db={prepare(){return{bind(){return{all:async()=>{time=Date.parse(env.PILOT_EXPIRES_AT);return{success:true,results:[{value:'{}'}],meta:{rows_read:1}};}};}};},batch(){assert.fail('sin batch después de vencimiento');}};
 const response=await worker.fetch(new Request('https://isolated.test/api/pilot/clock-sync',{method:'POST',headers:{Authorization:'Bearer test-only'},body:'{}'}),{...env,PILOT_CLOCK_SYNC_ENABLED:'1',PILOT_CLOCK_SYNC_MAX_ROWS_WRITTEN:'20000',CATALOG_DB:db});
 assert.equal(response.status,503);assert.equal((await response.json()).error,'PILOT_STOPPED');
});
