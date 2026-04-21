/**
 * Consolidated image host whitelist
 * Used for validating external image URLs
 * 
 * Note: This should match the remotePatterns in next.config.ts
 */

export const WHITELISTED_IMAGE_HOSTS = [
  // Argentine hardware stores
  '37bytes.com.ar',
  'acuarioinsumos.com.ar',
  'armytech.com.ar',
  'beings.com.ar',
  'clickgaming.com.ar',
  // 'compragamer.com',  // REMOVIDO: imagenes.compragamer.com responde 502 via Next.js image optimization
  'compugarden.com.ar',
  'contabilium.com',
  'dinobyte.ar',
  'fullh4rd.com.ar',
  'gamingcity.com.ar',
  'goldentechstore.com.ar',
  'hardcorecomputacion.com.ar',
  'hftecnologia.com.ar',
  'hypergaming.com.ar',
  'katech.com.ar',
  'liontech.com.ar',
  'maxtecno.com.ar',
  'megasoftargentina.com.ar',
  'mexx.com.ar',
  'mitiendanube.com',
  'nb.com.ar',
  'noxiestore.com',
  'portalstore.com.ar',
  'rockethard.com.ar',
  'scphardstore.com',
  'spacegamer.com.ar',
  'thegamershop.com.ar',
  'venex.com.ar',
  'vrx.com.ar',
  'wiztech.com.ar',
  'xt-pc.com.ar',
  
  // CDN and image services
  'cdn.qloud.ar',
  'qloud.ar',
  'qloud.com.ar',
  'statics.qloud.ar',
  'statics.qloud.com.ar',
  'statics2.qloud.com.ar',
  
  // Generic image hosts
  'imgur.com',
  'i.imgur.com',
  'mlstatic.com',
  's3.amazonaws.com',
  'unsplash.com',
  'vteximg.com.br',
] as const;

/**
 * Check if a URL's hostname is in the whitelist
 */
export function isImageHostWhitelisted(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return WHITELISTED_IMAGE_HOSTS.some(
      (host) => hostname === host || hostname.endsWith(`.${host}`)
    );
  } catch {
    return false;
  }
}
