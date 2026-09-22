export const PUBLIC_REDIRECTS = [
  { source: '/about', destination: '/acerca', permanent: true },
  { source: '/tiendas', destination: '/comparativa/comparar', permanent: true },
  { source: '/tiendas/:slug', destination: '/comparativa/comparar', permanent: true },
] as const;
