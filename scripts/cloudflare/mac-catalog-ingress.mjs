// Allowlist RE2 del túnel privado. Los assets se sirven desde Cloudflare.
// Mantener alineada con routeKind: sólo catálogo, portada observada y tres guías.
export const MAC_CATALOG_INGRESS_PATH = '^(/search/?|/product/[^/]+/?|/comparar/[^/]+/?|/comparativa/comparar/?|/api/search(/suggestions)?/?|/api/products/?|/api/pc-builder/catalog/?|/api/home/(observed-sections|sections)/?|/sitemap-index\\.xml/?|/product-sitemap/[0-9]+(\\.xml)?/?|/guia/(pc-gamer-1-millon|pc-gamer-2-millones|pc-gamer-3-millones)/?)$';

export const macCatalogIngressRule = {
  hostname: 'mac-catalog-private.comparador-hardware.com.ar',
  path: MAC_CATALOG_INGRESS_PATH,
  service: 'http://127.0.0.1:8825',
};
