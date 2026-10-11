// Sólo metadata certificada por el generador local habilita la caché. El reloj
// conserva los vencimientos originales: el TTL no renueva observaciones.
export const MAX_CACHE_TTL_MS = 60_000;
export function snapshotInterval(marker, now) {
  try {
    const metadata=JSON.parse(marker).cache;
    if(metadata?.version!==1 || typeof metadata.generation!=='string' || !metadata.generation || metadata.generation.length>128
      || typeof metadata.validFrom!=='string' || typeof metadata.validUntil!=='string') return null;
    const from=Date.parse(metadata.validFrom),until=Date.parse(metadata.validUntil);
    if(!Number.isFinite(from)||!Number.isFinite(until)||from>now||until<=now) return null;
    const expires=Math.min(now+MAX_CACHE_TTL_MS,until);
    return {generation:metadata.generation,expires,validUntil:until};
  } catch {return null;}
}
export function cacheInterval(marker,now) {
  const interval=snapshotInterval(marker,now);
  return interval&&interval.expires-now>=1000?interval:null;
}
export async function cacheRequest(url, params, evidence, generation) {
  // Orden y duplicados de tienda no alteran SQL ni la respuesta. No normalizar
  // texto/categoría por intuición: el matcher conserva su contrato exacto.
  const canonical=JSON.stringify({...params,p_stores:[...new Set(params.p_stores)].sort(),withOfferEvidence:evidence,generation,cacheVersion:2});
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical));
  const digest=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
  const key=new URL('/__pilot_search_cache/'+digest,url.origin);
  // No copiar Range, cookies o cabeceras condicionales del cliente: son
  // respuestas públicas completas, sin 206/304 ni datos de sesión.
  return new Request(key,{method:'GET'});
}
export async function readCached(cache, key, interval, now) {
  if(!cache||!key||!interval) return null;
  try {
    const response=await cache.match(key);
    const expiry=Number(response?.headers.get('X-Pilot-Cache-Expires'));
    if(!response || response.status!==200 || !Number.isFinite(expiry) || expiry<=now || expiry>interval.expires
      || response.headers.get('X-Pilot-Cache-Generation')!==interval.generation) return null;
    return response;
  } catch {return null;}
}
export async function writeCached(cache,key,response,interval,now) {
  const ttl=Math.floor((interval.expires-now)/1000);
  if(!cache||response.status!==200||ttl<1) return false;
  const headers=new Headers(response.headers);
  headers.set('Cache-Control','public, max-age='+ttl);
  headers.set('X-Pilot-Cache-Expires',String(interval.expires));
  headers.set('X-Pilot-Cache-Generation',interval.generation);
  try {await cache.put(key,new Response(response.clone().body,{status:200,headers}));return true;}
  catch {return false;}
}
