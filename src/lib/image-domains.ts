// ============================================
// Image Domains — Fuente única de dominios de imágenes
// ============================================
// Esta lista se usa tanto en el CSP (proxy.ts) como en
// next.config.ts remotePatterns. Mantener aqui evita
// desincronización entre ambas configuraciones.
// ============================================

export const IMAGE_DOMAINS = [
  '*.mlstatic.com',
  'i.imgur.com',
  'images.unsplash.com',
  '*.vteximg.com.br',
  'mexx-img-2019.s3.amazonaws.com',
  // 'imagenes.compragamer.com' - REMOVIDO: el servidor responde 502
  // cuando Next.js intenta optimizar, causando errores en producción.
  // Los productos de CompraGamer ahora cargan directamente sin optimization.
  // 'www.venex.com.ar' - REMOVIDO: thumbnails sin extensión rompen Next image optimizer.
  'www.fullh4rd.com.ar',
  'compugarden.com.ar',
  '*.compugarden.com.ar',
  'gamingcity.com.ar',
  'www.gamingcity.com.ar',
  'logg.api.cygnus.market',
  'katech.com.ar',
  'dinobyte.ar',
  // 'maximus.com.ar' - REMOVIDO: varias URLs devuelven 400 vía Next image optimizer.
  'maxtecno.com.ar',
  'thegamershop.com.ar',
  'hardcorecomputacion.com.ar',
  'goldentechstore.com.ar',
  'www.armytech.com.ar',
  'beings.com.ar',
  'rockethard.com.ar',
  'hypergaming.com.ar',
  'hftecnologia.com.ar',
  'clickgaming.com.ar',
  'megasoftargentina.com.ar',
  'noxiestore.com',
  'nb.com.ar',
  'invidcomputers.com',
  'portalstore.com.ar',
  '*.acdn-us.mitiendanube.com',
  'acdn-us.mitiendanube.com',
  'www.acuarioinsumos.com.ar',
  'www.gamerspoint.com.ar',
  'liontech.com.ar',
  'www.scphardstore.com',
  'spacegamer.com.ar',
  'vrx.com.ar',
  'wiztech.com.ar',
  'www.xt-pc.com.ar',
  'cdn.qloud.ar',
  'statics.qloud.ar',
  'statics.qloud.com.ar',
  'statics2.qloud.com.ar',
  'app.contabilium.com',
] as const;

export type ImageDomain = (typeof IMAGE_DOMAINS)[number];

/** Genera la directiva img-src del CSP a partir de la lista unica */
export function buildCspImgSrc(): string {
  const origins = IMAGE_DOMAINS.map((d) => `https://${d}`).join(' ');
  return `img-src 'self' data: ${origins}`;
}

/** Genera los remotePatterns de Next.js a partir de la lista unica */
export function buildRemotePatterns() {
  return IMAGE_DOMAINS.map((hostname) => ({
    protocol: 'https' as const,
    hostname,
    pathname: '/**',
  }));
}
