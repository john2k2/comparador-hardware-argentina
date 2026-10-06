import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { load } from 'cheerio';

// Lecturas del sitio evaluado. No consulta tiendas/feeds, pulsa afiliados,
// envía formularios, renueva guías ni solicita refresh.
const origin = new URL(process.env.PUBLIC_QA_ORIGIN ?? 'https://www.comparador-hardware.com.ar').origin;
const canonicalOrigin = 'https://www.comparador-hardware.com.ar';
const output = resolve(process.env.PUBLIC_QA_OUTPUT_DIR ?? `outputs/public-validation-${new Date().toISOString().slice(0, 10)}`);
const fixtures = process.env.PUBLIC_QA_FIXTURES === '1';
const workerRuntime = process.env.PUBLIC_QA_WORKER === '1';
const results = [];
const observations = [];
await mkdir(output, { recursive: true });
async function check(path, verify) {
  if (results.length) await pause(1000);
  const started = performance.now();
  try {
    const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(20000), redirect: 'follow' });
    if (new URL(response.url).origin !== origin) throw new Error('Redirección fuera del sitio evaluado');
    const proof = await verify(response, await response.text());
    results.push({ path, status: response.status, ms: Math.round(performance.now() - started), ...proof });
  } catch (error) {
    results.push({ path, passed: false, error: error.message, ms: Math.round(performance.now() - started) });
  }
}
function verdict(assertions, proof = {}) { return { passed: Object.values(assertions).every(Boolean), assertions, ...proof }; }
const searches = [
  '?q=ryzen', '?q=rtx&sortBy=price-asc&page=2', '?minPrice=100000&sortBy=price-asc',
  '?category=procesadores&sortBy=price-asc', '?q=ryzen&maxPrice=200000&sortBy=price-asc',
  '?category=memoria-ram&sortBy=price-desc', '?q=ryzen&stores=mexx', '?q=producto-inexistente-testsprite-9382',
];
for (const query of searches) await check(`/api/search${query}`, (response, body) => {
  const data = JSON.parse(body);
  const params = new URLSearchParams(query);
  const products = Array.isArray(data.products) ? data.products : [];
  const prices = products.map(product => product.lowestPrice);
  observations.push({ kind: 'search-coverage', query, count: products.length, total: data.pagination?.total, note: 'Vacío significa sin coincidencias elegibles; no acredita agotamiento ni catálogo completo.' });
  return verdict({
    status: response.status === 200,
    shape: Array.isArray(data.products) && Number.isInteger(data.pagination?.total) && data.pagination.total >= 0,
    pageSize: products.length <= 12,
    unique: new Set(products.map(product => product.id)).size === products.length,
    price: products.every(product => Number.isFinite(product.lowestPrice) && product.lowestPrice > 0 && product.prices?.length > 0),
    range: products.every(product => (!params.has('minPrice') || product.lowestPrice >= +params.get('minPrice')) && (!params.has('maxPrice') || product.lowestPrice <= +params.get('maxPrice'))),
    category: products.every(product => !params.has('category') || product.category === params.get('category')),
    categorySemantics: products.every(product => params.get('category') !== 'procesadores' || !/^(?:motherboard|mother|placa madre|gabinete|fuente|memoria|ram|cooler|refrigeraci[oó]n|ventilador|disipador)\b/i.test(product.name)),
    stores: products.every(product => !params.has('stores') || product.prices.every(offer => offer.storeId === params.get('stores'))),
    sort: prices.every((price, index) => index === 0 || !params.has('sortBy') || (params.get('sortBy') === 'price-asc' ? prices[index - 1] <= price : prices[index - 1] >= price)),
    expectedEmpty: !params.get('q')?.includes('inexistente') || (products.length === 0 && data.pagination?.total === 0),
  }, { count: products.length, total: data.pagination?.total, page: data.pagination?.page, prices, ids: products.map(product => product.id) });
});
for (const path of ['/', '/comparar/procesadores', '/comparar/placas-de-video', '/search?q=ryzen', '/guia', '/guia/pc-gamer-1-millon', '/comparativa/rtx-4060-vs-rx-7600', '/acerca', '/contacto', '/privacidad', '/terminos', '/auth']) {
  await check(path, (response, body) => {
    const $ = load(body);
    const schemas = $('script[type="application/ld+json"]').map((_, element) => { try { return JSON.parse($(element).text())['@type']; } catch { return 'invalid'; } }).get();
    const canonical = $('link[rel="canonical"]').attr('href');
    return verdict({
      status: response.status === 200, heading: $('h1').length === 1, title: $('title').text().length > 0,
      schemas: !schemas.includes('invalid'), canonical: !!canonical && new URL(canonical).origin === canonicalOrigin,
      removedIndex: $('a[href*="indice-precios-hardware"]').length === 0,
      fixtureIsolation: fixtures || !body.includes('fixture-ryzen-5600'),
    }, { h1: $('h1').text(), canonical, schemas, robots: $('meta[name="robots"]').attr('content') });
  });
}
for (const path of ['/product/testsprite-nonexistent-9382', '/indice-precios-hardware', '/indice-precios-hardware/datos.csv']) {
  await check(path, (response, body) => {
    const $ = load(body);
    const robots = $('meta[name="robots"]').map((_, element) => $(element).attr('content')).get();
    return verdict({ status: response.status === 404, noindex: robots.length > 0 && robots.every(value => /noindex/i.test(value)), removedIndex: $('a[href*="indice-precios-hardware"]').length === 0 }, { robots });
  });
}
for (const path of ['/sitemap.xml', '/llms.txt']) await check(path, (response, body) => verdict({ status: response.status === 200, retiredIndexAbsent: !body.includes('/indice-precios-hardware') }));
await check('/robots.txt', (response, body) => verdict({ status: response.status === 200, crawlerPolicy: fixtures ? /Disallow:\s*\/\s*$/m.test(body) : /sitemap/i.test(body) }));
await check('/api/juegos-digitales', (response, body) => {
  const data = JSON.parse(body);
  const offers = Array.isArray(data.offers) ? data.offers : [];
  observations.push({ kind: 'eneba-availability', state: data.status, offers: offers.length, feedUpdatedAt: data.feedUpdatedAt, fixtures, note: 'No acredita ventas, stock ni activación regional.' });
  return verdict({
    shape: ['ready', 'empty', 'error', 'disabled'].includes(data.status) && Array.isArray(data.offers),
    status: data.status === 'disabled' ? response.status === 404 : response.status === 200,
    fixtureIsolation: fixtures === !!response.headers.get('x-qa-fixture'),
    destinations: offers.every(offer => { const url = new URL(offer.url); return url.protocol === 'https:' && /(^|\.)eneba\.com$/.test(url.hostname) && !!url.searchParams.get('af_id'); }),
  }, { state: data.status, offers: offers.length, feedUpdatedAt: data.feedUpdatedAt });
});
for (const path of ['/api/admin/operational', '/api/admin/catalog-refresh', '/api/admin/alerts']) await check(path, response => verdict({ access: path.includes('catalog-refresh') ? response.status === 405 && response.headers.get('allow') === 'POST,OPTIONS' : [401, 403, 404].includes(response.status) }));
if (workerRuntime) for (const path of ['/.env.local', '/phpinfo.php']) await check(path, (response, body) => verdict({ status: response.status === 404, guard: body === 'Not Found' && response.headers.get('cache-control') === 'no-store' && /noindex/.test(response.headers.get('x-robots-tag') ?? '') }));
await writeFile(resolve(output, 'public-site.json'), JSON.stringify({ at: new Date().toISOString(), origin, fixtures, workerRuntime, requestSpacingMs: 1000, results, observations }, null, 2));
console.log(JSON.stringify({ total: results.length, passed: results.filter(result => result.passed).length, failed: results.filter(result => !result.passed), observations }, null, 2));
process.exitCode = results.some(result => !result.passed) ? 1 : 0;
