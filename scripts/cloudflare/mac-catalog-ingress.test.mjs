import assert from 'node:assert/strict';
import test from 'node:test';
import { MAC_CATALOG_INGRESS_PATH, macCatalogIngressRule } from './mac-catalog-ingress.mjs';
import { routeKind } from './mac-catalog-proxy.mjs';

test('el túnel admite las rutas públicas de catálogo que el proxy entrega a la Mac', () => {
  const paths = ['/search', '/product/cg-17076', '/comparar/ryzen', '/comparativa/comparar',
    '/api/search', '/api/search/suggestions', '/api/products', '/api/pc-builder/catalog',
    '/api/home/observed-sections', '/api/home/sections', '/sitemap-index.xml',
    '/product-sitemap/0', '/product-sitemap/42.xml', '/guia/pc-gamer-1-millon',
    '/guia/pc-gamer-2-millones', '/guia/pc-gamer-3-millones'];
  const ingress = new RegExp(MAC_CATALOG_INGRESS_PATH);
  for (const path of paths) for (const suffix of ['', '/']) for (const query of ['', '?_rsc=abc', '?id=cg-17076']) {
    const url = new URL(path + suffix + query, 'https://www.comparador-hardware.com.ar');
    assert.equal(routeKind(url.pathname), 'catalog', url.href);
    assert(ingress.test(url.pathname), url.href);
  }
  assert.equal(macCatalogIngressRule.service, 'http://127.0.0.1:8825');
});

test('el túnel conserva cerradas administración, autenticación, otras guías y assets', () => {
  const ingress = new RegExp(MAC_CATALOG_INGRESS_PATH);
  for (const path of ['/', '/api/admin/catalog-refresh', '/api/auth/session', '/__mac_catalog/health',
    '/guia', '/guia/armar', '/guia/pc-gamer-3-millones/refresh', '/guia/pc-gamer-3-millones-extra',
    '/api/pc-builder/catalog/refresh', '/api/home/sections/private', '/product-sitemap/private',
    '/_next/static/chunks/app.js', '/product/id/private']) assert(!ingress.test(path), path);
});
