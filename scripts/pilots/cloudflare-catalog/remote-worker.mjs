// Piloto remoto aislado: no tiene rutas del sitio ni acceso a Supabase.
import catalog from './worker.mjs';
import { applyRemoteSync } from './remote-sync.mjs';
import { d1Adapter } from './sqlite-adapter.mjs';
export function createRemoteWorker({ worker = catalog, now = () => Date.now() } = {}) {
  return {
    async fetch(request, env, ctx) {
      const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
      const reject = (status, error) => new Response(JSON.stringify({ error }), { status, headers });
      // Un piloto abandonado no sigue consumiendo la cuota compartida de D1.
      if (env.PILOT_ENABLED !== '1' || !Number.isFinite(Date.parse(env.PILOT_EXPIRES_AT)) || now() >= Date.parse(env.PILOT_EXPIRES_AT)) return reject(503, 'PILOT_STOPPED');
      if (!env.PILOT_ACCESS_TOKEN || request.headers.get('Authorization') !== `Bearer ${env.PILOT_ACCESS_TOKEN}`) return reject(401, 'PILOT_AUTH_REQUIRED');
      const url = new URL(request.url);
      if(url.pathname==='/api/pilot/state'&&request.method==='GET') {
        try {
          const db=d1Adapter(env.CATALOG_DB),row=await db.first("SELECT value FROM pilot_meta WHERE key='snapshot'");
          if(!row) return reject(503,'PILOT_STATE_UNAVAILABLE');
          return new Response(JSON.stringify({snapshot:row.value,rowsRead:db.metrics.rowsRead,rowsWritten:0}),{headers:{...headers,'Content-Type':'application/json'}});
        }catch{return reject(503,'PILOT_STATE_UNAVAILABLE');}
      }
      if (url.pathname === '/api/pilot/sync' && request.method === 'POST') {
        if (Number(request.headers.get('Content-Length')) > 128000) return reject(413, 'PILOT_SYNC_SIZE');
        try {
          // El lector cancela antes de parsear cuerpos ilimitados, incluso sin Content-Length.
          const reader = request.body.getReader(); const chunks = []; let size = 0;
          for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 128000) { await reader.cancel(); return reject(413, 'PILOT_SYNC_SIZE'); } chunks.push(value); }
          const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
          const result = await applyRemoteSync(env.CATALOG_DB, JSON.parse(new TextDecoder().decode(bytes)));
          return new Response(JSON.stringify(result), { headers: { ...headers, 'Content-Type': 'application/json' } });
        } catch { return reject(409, 'PILOT_SYNC_REJECTED'); }
      }
      if (url.pathname === '/' || url.pathname === '/api/search') {
        if ((url.searchParams.get('q') ?? '').length > 80 || Number(url.searchParams.get('pageSize') ?? 12) > 25 || Number(url.searchParams.get('page') ?? 1) > 50 || url.searchParams.getAll('store').length > 34) return reject(400, 'PILOT_SEARCH_LIMIT');
      }
      const response = await worker.fetch(request, env, ctx);
      const result = new Response(response.body, response);
      for (const [key, value] of Object.entries(headers)) result.headers.set(key, value);
      result.headers.set('X-Pilot-Environment', 'isolated-remote-sample');
      return result;
    },
  };
}
export default createRemoteWorker();
