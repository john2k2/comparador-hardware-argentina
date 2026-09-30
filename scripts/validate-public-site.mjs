import { mkdir, writeFile } from 'node:fs/promises';
import { load } from 'cheerio';

// Lecturas públicas acotadas. No crea cuentas, envía formularios ni solicita refresh.
const origin = 'https://www.comparador-hardware.com.ar';
const output = new URL('../testsprite_tests/full-validation/2026-09-30/', import.meta.url);
await mkdir(output, { recursive: true });
const results = [];
async function check(path, verify, attempt = 1) {
  const started = performance.now();
  try {
    const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(20000) });
    const body = await response.text();
    const proof = await verify(response, body);
    results.push({ path, attempt, status: response.status, ms: Math.round(performance.now() - started), ...proof });
  } catch (error) {
    results.push({ path, attempt, passed: false, error: error.message, ms: Math.round(performance.now() - started) });
  }
}
const searches = [
  '?q=ryzen', '?q=rtx&sortBy=price-asc&page=2',
  '?minPrice=100000&sortBy=price-asc', '?category=procesadores&sortBy=price-asc',
  '?q=ryzen&maxPrice=200000&sortBy=price-asc', '?category=memoria-ram&sortBy=price-desc',
  '?q=ryzen&stores=mexx', '?q=producto-inexistente-testsprite-9382',
];
for (let attempt = 1; attempt <= 3; attempt++) {
  for (const search of searches) await check(`/api/search${search}`, (response, body) => {
    const data = JSON.parse(body);
    if (response.status !== 200) return { passed: false, error: data.error };
    const params = new URLSearchParams(search);
    const products = data.products ?? [];
    const prices = products.map(p => p.lowestPrice);
    const positive = prices.filter(p => p > 0);
    const assertions = {
      shape: Array.isArray(data.products) && Number.isInteger(data.pagination?.total),
      pageSize: products.length <= 12,
      unique: new Set(products.map(p => p.id)).size === products.length,
      range: products.every(p => (!params.has('minPrice') || p.lowestPrice >= +params.get('minPrice')) && (!params.has('maxPrice') || p.lowestPrice <= +params.get('maxPrice'))),
      category: products.every(p => !params.has('category') || p.category === params.get('category')),
      categorySemantics: products.every(p => params.get('category') !== 'procesadores' || !/^(?:motherboard|mother|placa madre|gabinete|fuente|memoria|ram|cooler|refrigeraci[oó]n|ventilador|disipador)\b/i.test(p.name)),
      stores: products.every(p => !params.has('stores') || (p.prices.length > 0 && p.prices.every(o => o.storeId === params.get('stores')))),
      sort: positive.every((p, i) => i === 0 || !params.has('sortBy') || (params.get('sortBy') === 'price-asc' ? positive[i-1] <= p : positive[i-1] >= p)),
      expectedEmpty: !params.get('q')?.includes('inexistente') || (products.length === 0 && data.pagination.total === 0),
    };
    return { passed: Object.values(assertions).every(Boolean), assertions, count: products.length, total: data.pagination.total, page: data.pagination.page, prices, ids: products.map(p => p.id), names: products.map(p=>p.name) };
  }, attempt);
}
for (const path of ['/', '/guia', '/guia/pc-gamer-1-millon', '/comparativa/rtx-4060-vs-rx-7600', '/indice-precios-hardware', '/privacidad', '/terminos', '/auth']) {
  await check(path, (response, body) => {
    const $ = load(body);
    const schemas = $('script[type="application/ld+json"]').map((_, el) => { try { return JSON.parse($(el).text())['@type']; } catch { return 'invalid'; } }).get();
    const canonical = $('link[rel="canonical"]').attr('href');
    const assertions = { status: response.status === 200, heading: $('h1').length === 1, title: $('title').text().length > 0, schemas: !schemas.includes('invalid'), canonical: !!canonical && new URL(canonical).origin === origin };
    return { passed: Object.values(assertions).every(Boolean), assertions, h1: $('h1').text(), canonical, schemas, robots: $('meta[name="robots"]').attr('content') };
  });
}
await check('/product/testsprite-nonexistent-9382', (r,b) => ({ passed: r.status === 404 && load(b)('meta[name="robots"]').toArray().some(el => /noindex/.test(load(b)(el).attr('content'))), robots: load(b)('meta[name="robots"]').map((_,el) => load(b)(el).attr('content')).get() }));
await check('/indice-precios-hardware/datos.csv', (r,b) => {
  const lines = b.trim().split(/\r?\n/);
  const rows = lines.slice(1).map(l => l.split(','));
  const assertions = { status: r.status === 200, type: /text\/csv/.test(r.headers.get('content-type')), header: lines[0] === 'fecha,categoria,indice,precio_mediano_ars,productos,ofertas', data: rows.length > 0, values: rows.every(v => v.length === 6 && Number(v[2]) > 0 && Number(v[3]) > 0 && Number(v[4]) > 0 && Number(v[5]) >= Number(v[4])), dates: rows.every(v => /^\d{4}-\d{2}-\d{2}/.test(v[0])) };
  return { passed: Object.values(assertions).every(Boolean), assertions, rows: rows.length, first: rows[0], last: rows.at(-1) };
});
await check('/guia/pc-gamer-1-millon', async (r,b) => {
  const $ = load(b);
  const urls = $('a').filter((_,e) => $(e).text().trim() === 'Ver en tienda →').map((_,e) => $(e).attr('href')).get();
  // La guía puede entrar en preparación cuando no hay siete ofertas válidas.
  if (urls.length !== 7) return { passed: false, reason: 'No hay siete ofertas comprables para contrastar', offers: urls.length };
  if (!urls.every(url => new URL(url).hostname === 'compragamer.com')) return { passed: false, reason: 'La selección cambió de proveedor; requiere contraste específico' };
  const response = await fetch('https://static.compragamer.com/productos', {
    signal: AbortSignal.timeout(20000),
    headers: { Origin: 'https://compragamer.com', Referer: 'https://compragamer.com/', Accept: 'application/json' },
  });
  if (!response.ok) return { passed: false, reason: `La tienda respondió ${response.status}` };
  const catalog = await response.json();
  const offers = urls.map(url => {
    const sku = url.split('_').at(-1);
    const product = catalog.find(p => String(p.id_producto) === sku);
    return { sku, url, name: product?.nombre, price: Number(product?.precioEspecial), stock: Number(product?.stock), sellable: product?.vendible };
  });
  const total = offers.reduce((sum, offer) => sum + offer.price, 0);
  const assertions = { available: offers.every(o => o.price > 0 && o.stock > 0 && (o.sellable === 1 || o.sellable === true)), ceiling: total <= 1100000 };
  return { passed: r.status === 200 && Object.values(assertions).every(Boolean), assertions, total, budget: 1000000, allowedMaximum: 1100000, offers, paymentBasis: 'precioEspecial; confirmar condiciones en tienda' };
});
for (const path of ['/api/admin/operational', '/api/admin/catalog-refresh', '/api/admin/alerts']) await check(path, r => ({ passed: path.includes('catalog-refresh') ? r.status === 405 && r.headers.get('allow') === 'POST,OPTIONS' : [401,403,404].includes(r.status) }));
await check('/robots.txt', (r,b) => ({ passed: r.status === 200 && /sitemap/i.test(b), sitemapDeclared: /sitemap/i.test(b) }));
await writeFile(new URL('public-site.json', output), JSON.stringify({ at: new Date().toISOString(), origin, results }, null, 2));
console.log(JSON.stringify({ total: results.length, passed: results.filter(x=>x.passed).length, failed: results.filter(x=>!x.passed) }, null, 2));
process.exitCode = results.some(x=>!x.passed) ? 1 : 0;
