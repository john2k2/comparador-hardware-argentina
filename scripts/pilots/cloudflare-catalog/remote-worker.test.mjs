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
