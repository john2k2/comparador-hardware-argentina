import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {fileURLToPath} from 'node:url';
// Cache API y D1 reales de workerd local; el motor se sustituye por una lectura
// pequeña para aislar ahorro/invalidation de la semántica SQL del catálogo.
test('workerd Cache API: HIT reduce a una fila, generación invalida y errorDB no sirve caché',async()=>{
  const bundled=await build({stdin:{contents:`import {createWorker} from './worker.mjs';export default createWorker({search:async(db,params)=>{const row=await db.first('SELECT row_json FROM runtime_record');return {total:1,totalPages:1,page:params.p_page,pageSize:params.p_page_size,products:[JSON.parse(row.row_json)]};}});`,resolveDir:fileURLToPath(new URL('.',import.meta.url)),sourcefile:'cache-runtime.mjs'},bundle:true,write:false,format:'esm',platform:'browser'});
  const runtime=new Miniflare({telemetry:{enabled:false},workers:[{config:{name:'cache-local-test',compatibilityDate:'2026-10-10',cache:{enabled:true},manifest:{mainModule:'worker.mjs',modules:{'worker.mjs':{type:'esm',contents:bundled.outputFiles[0].text}}},env:{CATALOG_DB:{type:'d1',id:'00000000-0000-0000-0000-000000000001'}}}}]});
  try {
    const db=await runtime.getD1Database('CATALOG_DB');
    await db.batch([db.prepare('CREATE TABLE pilot_meta(key TEXT PRIMARY KEY,value TEXT)'),db.prepare('CREATE TABLE runtime_record(row_json TEXT)'),db.prepare('INSERT INTO runtime_record VALUES(?)').bind(JSON.stringify({id:'old',lowest_price:123}))]);
    const marker=generation=>JSON.stringify({cache:{version:1,generation,validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+120000).toISOString()}});
    await db.prepare('INSERT INTO pilot_meta VALUES(?,?)').bind('snapshot',marker('g1')).run();
    const request=()=>runtime.dispatchFetch('http://pilot.local/api/search?q=RTX&minPrice=0');
    const miss=await request();assert.equal(miss.status,200);assert.equal(miss.headers.get('X-Pilot-Cache'),'MISS');assert.equal(miss.headers.get('X-Pilot-D1-Queries'),'3');assert.equal((await miss.json()).products[0].id,'old');
    const hit=await request();assert.equal(hit.status,200);assert.equal(hit.headers.get('X-Pilot-Cache'),'HIT');assert.equal(hit.headers.get('X-Pilot-D1-Queries'),'1');assert.equal(hit.headers.get('X-Pilot-D1-Rows-Read'),'1');assert.equal((await hit.json()).products[0].id,'old');
    await db.batch([db.prepare('UPDATE runtime_record SET row_json=?').bind(JSON.stringify({id:'new',lowest_price:100})),db.prepare("UPDATE pilot_meta SET value=? WHERE key='snapshot'").bind(marker('g2'))]);
    const changed=await request();assert.equal(changed.headers.get('X-Pilot-Cache'),'MISS');assert.equal((await changed.json()).products[0].id,'new');
    assert.equal((await request()).headers.get('X-Pilot-Cache'),'HIT');
    const expired=JSON.stringify({cache:{version:1,generation:'g2',validFrom:new Date(Date.now()-120000).toISOString(),validUntil:new Date(Date.now()-1).toISOString()}});
    await db.prepare("UPDATE pilot_meta SET value=? WHERE key='snapshot'").bind(expired).run();
    const bypass=await request();assert.equal(bypass.headers.get('X-Pilot-Cache'),'BYPASS');assert.equal(bypass.headers.get('X-Pilot-D1-Queries'),'3');
    await db.prepare('DROP TABLE pilot_meta').run();assert.equal((await request()).status,503);
  } finally {await runtime.dispose();}
});
