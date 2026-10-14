import test from 'node:test';
import assert from 'node:assert/strict';
import { d1Adapter } from './sqlite-adapter.mjs';

test('sesión replica empieza primaria y comprobación final evita marcador antiguo del bookmark',async()=>{
  const calls=[];let current='g1';
  const target=(name,generation)=>({prepare(sql){return {bind(...values){calls.push({name,sql,values});return {async all(){return {
    success:true,results:[{value:generation()}],meta:{rows_read:1,rows_written:0,duration:2,served_by_primary:name==='primary'}};}};}};}});
  const primary=target('primary',()=>current),session=target('session',()=> 'g1');
  primary.withSession=constraint=>{assert.equal(constraint,'first-primary');return session;};
  const db=d1Adapter(primary,{readReplication:true});
  assert.equal((await db.first('marker')).value,'g1');
  current='g2';assert.equal((await db.all('results',['bound']))[0].value,'g1');
  assert.equal((await db.latestFirst('marker')).value,'g2');
  assert.deepEqual(calls.map(x=>x.name),['session','session','primary']);
  assert.deepEqual(calls[1].values,['bound']);assert.equal(db.metrics.queries,3);
  assert.equal(db.metrics.replicaQueries,2);assert.equal(db.metrics.rowsRead,3);
});

test('por defecto conserva lectura primaria sin exigir API de sesión',async()=>{
  const database={prepare(){return {bind(){return {async all(){return {success:true,results:[],meta:{rows_read:0}};}};}};}};
  const db=d1Adapter(database);assert.equal(await db.first('empty'),undefined);
  assert.equal(await db.latestFirst('empty'),undefined);assert.equal(db.metrics.replicaQueries,0);
});

test('fallo de sesión o de consulta nunca se transforma en catálogo vacío',async()=>{
  assert.throws(()=>d1Adapter({},{readReplication:true}),/withSession/);
  const db=d1Adapter({prepare(){return {bind(){return {async all(){return {success:false};}};}};}});
  await assert.rejects(()=>db.all('broken'),/CATALOG_DATABASE_READ_FAILED/);
  assert.equal(db.metrics.queries,0);
});
