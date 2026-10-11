// Puente privado loopback: Cloudflare responde; la demanda escribe sólo en la Mac.
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, appendFileSync } from 'node:fs';
import { pilotHtml } from './pilot-ui.mjs';
import { initializeRefreshDemand, enqueueKnownProducts } from './refresh-demand.mjs';
const [sqlite, tokenFile, logFile] = process.argv.slice(2);
if (!sqlite || !tokenFile || !logFile) throw new Error('Usar SQLITE TOKEN_PRIVADO LOG');
const db = new DatabaseSync(sqlite), token = readFileSync(tokenFile,'utf8').trim();
initializeRefreshDemand(db);
const html = pilotHtml.replaceAll('Catálogo local · prueba de búsqueda','Cloudflare gratis · muestra de búsqueda').replace('Piloto en esta Mac. La página pública sigue usando su búsqueda actual. Un precio copiado conserva su fecha original; esta prueba no actualiza ofertas.','Muestra aislada en Cloudflare: 1.012 productos. La página publicada conserva su búsqueda. La Mac recibe una cola de ofertas conocidas; el lector se ejecuta por separado. Ventana general del corte: 24 h, sin renovar fechas al buscar.').replaceAll('catálogo local','catálogo de prueba en Cloudflare').replaceAll('en esta Mac','de ida y vuelta desde esta Mac').replaceAll('D1 local','D1 remoto').replace('maxlength="240"','maxlength="80"');
const server = createServer(async (request,response) => {
  const reply = (status,body,headers={}) => {response.writeHead(status,{'Cache-Control':'no-store','X-Robots-Tag':'noindex',...headers});response.end(body);};
  if(request.headers.host!=='127.0.0.1:8798'||request.headers['sec-fetch-site']==='cross-site'||request.method!=='GET') return reply(403,'Acceso local requerido');
  const url = new URL(request.url,'http://127.0.0.1:8798');
  if(url.pathname==='/')return reply(200,html,{'Content-Type':'text/html; charset=utf-8'});
  if(!['/api/search','/health'].includes(url.pathname))return reply(404,'Ruta desconocida');
  try {
    const remote = await fetch('https://catalog-search-free-pilot-20261011.ortiz-jonathan.workers.dev'+url.pathname+url.search,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
    const body=await remote.text(),headers={};
    for(const key of ['content-type','x-pilot-cache','x-pilot-d1-rows-read','x-pilot-d1-queries','server-timing'])if(remote.headers.has(key))headers[key]=remote.headers.get(key);
    if(remote.ok&&url.pathname==='/api/search') {
      const data=JSON.parse(body),ids=data.products.map(p=>p.id).slice(0,20);
      const demand=enqueueKnownProducts(db,{productIds:ids,now:Date.now(),freshMs:3*3600000,refreshAheadMs:90*60000,storeIds:['maxtecno','dinobyte','goldentechstore']});
      appendFileSync(logFile,JSON.stringify({at:new Date().toISOString(),productIds:ids,demand})+'\n',{mode:0o600});
      headers['x-pilot-local-demand']='queued';
    }
    reply(remote.status,body,headers);
  }catch {reply(503,JSON.stringify({error:'PILOT_BRIDGE_UNAVAILABLE'}),{'Content-Type':'application/json'});}
});
server.listen(8798,'127.0.0.1',()=>console.log('Puente privado: http://127.0.0.1:8798'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
