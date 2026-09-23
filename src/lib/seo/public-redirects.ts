export const PUBLIC_REDIRECTS = [
  { source: '/about', destination: '/acerca', permanent: true },
  { source: '/tiendas', destination: '/comparativa/comparar', permanent: true },
  { source: '/tiendas/:slug', destination: '/comparativa/comparar', permanent: true },
  { source: '/guia/pc-gamer-4-millones', destination: '/guia/armar?pesos=4000000', permanent: true },
] as const;
