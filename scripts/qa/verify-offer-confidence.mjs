import { chromium } from 'playwright';
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
// Sólo prueba la candidata local; no navega ni escribe en tiendas.
const base = process.env.OFFER_CONFIDENCE_BASE_URL ?? 'http://127.0.0.1:3143';
const origin = new URL(base);
assert(origin.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(origin.hostname), 'La QA requiere una URL local');
const folder = process.env.OFFER_CONFIDENCE_REPORT_DIR ?? 'tmp/confianza-real';
await mkdir(folder, { recursive: true });
const bundled = await build({ entryPoints: ['src/lib/product/offer-presentation.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { buildOfferPresentation } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const report = { at: new Date().toISOString(), runtime: 'Wrangler local, bundle OpenNext; datos públicos reales, sin fixtures', routes: [], details: [], comparison: null, builder: null, pageErrors: [] };
async function read(path) {
 const start = performance.now();
 const response = await fetch(base + path, { signal: AbortSignal.timeout(20000) });
 report.routes.push({ path, status: response.status, ms: Math.round(performance.now() - start) });
 assert.equal(response.status, 200, path);
 return response.json();
}
const cpuResults = await read('/api/products?category=procesadores&q=5600');
const cpuBResults = await read('/api/products?category=procesadores&q=5700X');
const gpuResults = await read('/api/products?category=tarjetas-graficas&q=RTX%204060');
const cpu = cpuResults.products[0], cpuB = cpuBResults.products[0], gpu = gpuResults.products[0];
assert(cpu && cpuB && gpu);
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
page.on('pageerror', error => report.pageErrors.push(error.message));
async function closePrivacy() {
 const reject = page.getByRole('button', { name: 'Rechazar analítica', exact: true });
 if (await reject.isVisible()) await reject.click();
 const close = page.getByRole('button', { name: 'Cerrar preferencias', exact: true });
 if (await close.isVisible()) await close.click();
}
try {
 for (const [kind, selected] of [['cpu', cpu], ['gpu', gpu]]) {
  await page.setViewportSize(kind === 'gpu' ? { width: 390, height: 844 } : { width: 1280, height: 800 });
  const product = await read(`/api/products?id=${encodeURIComponent(selected.id)}&preferDb=1`);
  const expected = buildOfferPresentation(product, product.prices, Date.now());
  const response = await page.goto(`${base}/product/${encodeURIComponent(selected.id)}?from=%2Fcomparativa%2Fcomparar`);
  assert.equal(response.status(), 200);
  await page.getByRole('heading', { level: 1 }).waitFor();
  assert.equal(new URL(page.url()).pathname, `/product/${encodeURIComponent(selected.id)}`);
  const recent = page.getByRole('region', { name: 'Ofertas recientes comparables', exact: true });
  const stores = await recent.locator('[data-store-id]').evaluateAll(rows => rows.map(row => row.getAttribute('data-store-id')));
  assert.deepEqual(stores, expected.recentPrices.map(offer => offer.storeId));
  const summary = page.getByRole('region', { name: 'Precio y compra', exact: true });
  if (expected.bestOffer) {
   await summary.waitFor();
   assert.equal(await summary.locator('a[target="_blank"]').getAttribute('href'), expected.bestOffer.url);
   const amount = (await summary.innerText()).match(/\$\s*([\d.]+(?:,\d+)?)/);
   assert.equal(Number(amount[1].replaceAll('.', '').replace(',', '.')), Math.round(expected.bestOffer.price));
  } else assert.equal(await summary.count(), 0);
  const references = page.getByTestId('reference-offers');
  if (await references.count() && !await references.evaluate(element => element.open)) await references.locator('summary').click();
  const dates = await page.locator('#ofertas-por-tienda p').filter({ hasText: 'Precio relevado:' }).allTextContents();
  const expectedDates = product.prices.filter(offer => Number.isFinite(new Date(offer.lastUpdated).getTime()) && new Date(offer.lastUpdated).getTime() > 0).map(offer => 'Precio relevado: ' + new Date(offer.lastUpdated).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' }));
  assert.deepEqual(dates.sort(), expectedDates.sort());
  assert.equal(await page.getByRole('link', { name: 'Volver al catálogo', exact: true }).getAttribute('href'), '/comparativa/comparar');
  await closePrivacy();
  await page.evaluate(() => window.scrollTo(0, 0));
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: `${folder}/${kind}-real.png`, fullPage: true });
  report.details.push({ kind, id: product.id, name: product.name, recentStores: stores, referenceCount: expected.referencePrices.length, displayedBestPrice: expected.bestOffer?.price ?? null, originalOfferDatesPreserved: true, originalPublicationPreserved: true, horizontalOverflow: false, observations: product.prices.map(offer => ({ storeId: offer.storeId, price: offer.price, stock: offer.stock, observedAt: offer.lastUpdated, includedInRecent: expected.recentPrices.includes(offer) })) });
 }
 await page.setViewportSize({ width: 1280, height: 800 });
 await page.goto(base + '/comparativa/comparar');
 for (const [side, query, selected] of [['A', '5600', cpu], ['B', '5700X', cpuB]]) {
  const search = page.getByRole('textbox', { name: `Buscar producto ${side}`, exact: true });
  await search.fill(query); await search.press('Enter');
  await page.getByRole('button').filter({ hasText: selected.name }).first().click();
 }
 await page.getByRole('link', { name: 'VER PRECIOS DE A', exact: true }).click();
 await page.waitForURL(url => url.pathname === `/product/${encodeURIComponent(cpu.id)}`, { timeout: 20000 });
 assert.equal(new URL(page.url()).pathname, `/product/${encodeURIComponent(cpu.id)}`);
 await page.getByRole('link', { name: 'Volver al catálogo', exact: true }).click();
 await page.getByRole('button', { name: 'Cambiar producto A', exact: true }).waitFor();
 await page.getByRole('button', { name: 'Cambiar producto B', exact: true }).waitFor();
 const selection = JSON.parse(await page.evaluate(() => sessionStorage.getItem('comparison-selection:v1')));
 assert.equal(selection.leftId, cpu.id); assert.equal(selection.rightId, cpuB.id);
 assert.deepEqual(Object.keys(selection).sort(), ['category', 'leftId', 'rightId', 'savedAt', 'useCase', 'version']);
 await page.evaluate(() => window.scrollTo(0, 0));
 await page.screenshot({ path: `${folder}/comparador-real-regreso.png`, fullPage: true });
 report.comparison = { leftId: cpu.id, rightId: cpuB.id, recovered: true, idsOnly: true };
 const builderResponse = await page.goto(base + '/guia/armar');
 assert.equal(builderResponse.status(), 200);
 await page.getByRole('button', { name: 'Armar PC', exact: true }).waitFor();
 report.builder = { status: builderResponse.status(), loaded: true, commercialBuildVerified: false };
 assert.deepEqual(report.pageErrors, []);
 report.result = 'passed';
} catch(error) { report.result = 'failed'; report.error = error.message; process.exitCode = 1; }
finally { await browser.close(); await writeFile(`${folder}/catalogo-real.json`, JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report)); }
