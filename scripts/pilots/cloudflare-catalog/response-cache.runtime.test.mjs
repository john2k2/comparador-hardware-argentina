import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
// Cache API y D1 reales de workerd local; el motor se sustituye por una lectura
// pequeña para aislar ahorro/invalidation de la semántica SQL del catálogo.
for (const readReplication of [false,true]) test(`workerd Cache API con sesión=${readReplication}: HIT, invalidación y DB caída`,async()=>{
  const bundled=await build({stdin:{contents:`import {createWorker} from './worker.mjs';export default createWorker({search:async(db,params)=>{const row=await db.first('SELECT row_json FROM runtime_record');return {total:1,totalPages:1,page:params.p_page,pageSize:params.p_page_size,products:[JSON.parse(row.row_json)]};}});`,resolveDir:fileURLToPath(new URL('.',import.meta.url)),sourcefile:'cache-runtime.mjs'},bundle:true,write:false,format:'esm',platform:'browser'});
  const runtime=new Miniflare({telemetry:{enabled:false},workers:[{config:{name:'cache-local-test',compatibilityDate:'2026-10-10',cache:{enabled:true},manifest:{mainModule:'worker.mjs',modules:{'worker.mjs':{type:'esm',contents:bundled.outputFiles[0].text}}},env:{CATALOG_DB:{type:'d1',id:'00000000-0000-0000-0000-000000000001'},CATALOG_READ_REPLICATION:{type:'text',value:readReplication?'1':'0'}}}}]});
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

for (const readReplication of [false,true]) test(`query-clock Cache API/D1 sesión=${readReplication}: global vencido, TTL exacto, error guard y lectura lenta`,async()=>{
  const clock=Date.now(),source=`import {createWorker} from './worker.mjs';import {searchCatalog} from './engine.mjs';
    let clock=${clock},slow=false;const pilot=createWorker({now:()=>clock,search:async(...args)=>{const result=await searchCatalog(...args);if(slow)clock=${clock}+120000;return result;}});
    export default {async fetch(request,env){const url=new URL(request.url);if(url.pathname==='/clock'){clock=Number(url.searchParams.get('now'));return Response.json({clock});}
    if(url.pathname==='/slow'){slow=true;return Response.json({slow});}return pilot.fetch(request,env);}};`;
  const bundled=await build({stdin:{contents:source,resolveDir:fileURLToPath(new URL('.',import.meta.url)),sourcefile:'query-clock-runtime.mjs'},bundle:true,write:false,format:'esm',platform:'browser'});
  const runtime=new Miniflare({telemetry:{enabled:false},workers:[{config:{name:'query-clock-local-test',compatibilityDate:'2026-10-10',cache:{enabled:true},manifest:{mainModule:'worker.mjs',modules:{'worker.mjs':{type:'esm',contents:bundled.outputFiles[0].text}}},env:{CATALOG_DB:{type:'d1',id:'00000000-0000-0000-0000-000000000002'},CATALOG_READ_REPLICATION:{type:'text',value:readReplication?'1':'0'}}}}]});
  try {
    const db=await runtime.getD1Database('CATALOG_DB');
    for(const sql of (readFileSync(new URL('./schema.sql',import.meta.url),'utf8')+readFileSync(new URL('./projection.sql',import.meta.url),'utf8')).split(';').filter(sql=>sql.trim()))await db.prepare(sql).run();
    await db.prepare('INSERT INTO stores VALUES(?,?)').bind('mexx','{}').run();
    for(const [id,name,category,observed,transition] of [
      ['rtx','RTX 4060','placas-de-video',clock-3600000,clock+120000],
      ['cpu','CPU Ryzen 7600','procesadores',clock-14400002,clock-1],
    ]) {
      const stamp=new Date(observed).toISOString(),text=name.toLowerCase(),url='https://mexx.example/'+id;
      const product=JSON.stringify({id,name,category}),offer=JSON.stringify({id:'offer-'+id,product_id:id,store_id:'mexx',price:100000,stock:'in-stock',url,last_updated:stamp});
      await db.batch([
        db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,category,id,text,text,1,0,stamp,stamp,product),
        db.prepare('INSERT INTO product_substrings(id,document) VALUES(?,?)').bind(id,text),
        db.prepare('INSERT INTO summaries VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,100000,100000,100000,1,url,0,'["mexx"]',null,null,stamp,'{}'),
        db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').bind('offer-'+id,id,'mexx',100000,url,offer),
        db.prepare('INSERT INTO price_basis VALUES(?,?,?,?,?,?,?,?)').bind(id,'current','offer-'+id,'mexx',100000,'in-stock',url,stamp),
        db.prepare('INSERT INTO search_projection VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,category,id,1,100000,100000,100000,1,1,url,stamp,new Date(transition).toISOString()),
      ]);
    }
    const marker=generation=>JSON.stringify({projectionVersion:1,counts:{products:2,product_prices:2,catalog_price_summaries:2,stores:1},cache:{version:1,generation,validFrom:new Date(clock-1000).toISOString(),validUntil:new Date(clock-1).toISOString()}});
    await db.prepare('INSERT INTO pilot_meta VALUES(?,?)').bind('snapshot',marker('g1')).run();
    const request=(query='q=rtx')=>runtime.dispatchFetch('http://pilot.local/api/search?'+query);
    const miss=await request();assert.equal(miss.status,200);assert.equal(miss.headers.get('X-Pilot-Cache'),'MISS');assert.equal(miss.headers.get('X-Pilot-D1-Queries'),'5');
    const expected=await miss.json();assert.equal(expected.products[0].id,'rtx');
    for(const query of ['q=rtx','q=rtx']) {const hit=await request(query);assert.equal(hit.headers.get('X-Pilot-Cache'),'HIT');assert.equal(hit.headers.get('X-Pilot-D1-Queries'),'1');assert.equal(hit.headers.get('Cache-Control'),'no-store');assert.deepEqual(await hit.json(),expected);}
    await runtime.dispatchFetch('http://pilot.local/clock?now='+(clock+59999));assert.equal((await request()).headers.get('X-Pilot-Cache'),'HIT');
    await runtime.dispatchFetch('http://pilot.local/clock?now='+(clock+60000));assert.equal((await request()).headers.get('X-Pilot-Cache'),'MISS');
    await db.prepare("UPDATE pilot_meta SET value=? WHERE key='snapshot'").bind(marker('g2')).run();assert.equal((await request()).headers.get('X-Pilot-Cache'),'MISS');
    await runtime.dispatchFetch('http://pilot.local/clock?now='+clock);await runtime.dispatchFetch('http://pilot.local/slow');
    const slow=await request('q=rtx&sortBy=name');assert.equal(slow.status,503);assert.equal((await slow.json()).error,'CATALOG_CLOCK_INTERVAL_EXPIRED');
    // El engine original sigue funcionando sin el índice utilizado sólo por el guard.
    await db.prepare('DROP INDEX projection_clock_idx').run();
    const bypass=await request('q=rtx&sortBy=price-asc');assert.equal(bypass.status,200);assert.equal(bypass.headers.get('X-Pilot-Cache'),'BYPASS');
  } finally {await runtime.dispose();}
});
