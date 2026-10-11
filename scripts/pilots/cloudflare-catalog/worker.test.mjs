import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.mjs';
function database(rows=[],error=null) {
  return {prepare(sql){assert.equal(sql,"SELECT value FROM pilot_meta WHERE key='snapshot'");return {bind(...values){assert.deepEqual(values,[]);return {async all(){if(error)throw error;return {success:true,results:rows,meta:{rows_read:rows.length}};}};}};}};
}
test('health sólo confirma disponibilidad cuando existe el marcador del snapshot',async()=>{
  const ready=await worker.fetch(new Request('http://localhost/health'),{CATALOG_DB:database([{value:'verified-snapshot'}])});
  assert.equal(ready.status,200);assert.equal((await ready.json()).status,'ready');
  const empty=await worker.fetch(new Request('http://localhost/health'),{CATALOG_DB:database()});
  assert.equal(empty.status,503);assert.equal((await empty.json()).status,'snapshot-not-ready');
  const broken=await worker.fetch(new Request('http://localhost/health'),{CATALOG_DB:database([],new Error('table missing'))});
  assert.equal(broken.status,503);assert.equal((await broken.json()).status,'database-unavailable');
});
test('métodos, rutas y parámetros inválidos se rechazan antes de leer D1',async()=>{
  const env={CATALOG_DB:{prepare(){assert.fail('D1 must not be accessed');}}};
  assert.equal((await worker.fetch(new Request('http://localhost/api/search',{method:'POST'}),env)).status,405);
  assert.equal((await worker.fetch(new Request('http://localhost/unknown'),env)).status,404);
  assert.equal((await worker.fetch(new Request('http://localhost/api/search?pageSize=49'),env)).status,400);
});
