import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import * as cheerio from 'cheerio';

// Corte de lectura por tienda, sin DB, cuentas, carritos ni persistencia de ofertas.
const samplePath = process.argv[2] ?? 'docs/reports/fiabilidad-tiendas-2026-10-06/muestra-componentes.json';
const folder = resolve(process.argv[3] ?? 'tmp/fiabilidad-tiendas/corte-inicial');
const inventoryPath = process.argv[4] ?? 'docs/reports/fiabilidad-tiendas-2026-10-06/inventario.json';
const inventory = JSON.parse(await readFile(inventoryPath, 'utf8'));
const samples = JSON.parse(await readFile(samplePath, 'utf8')).samples;
assert(Array.isArray(samples), 'La muestra debe contener filas, no un error SQL');
await mkdir(`${folder}/responses`, { recursive: true });
for (const key of ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET', 'CATALOG_REFRESH_CRON_SECRET', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'CF_API_TOKEN', 'CF_ACCOUNT_ID']) delete process.env[key];
process.env.LOG_LEVEL = 'silent';
const bundle = await build({
  stdin: { contents: "export { fetchKnownOffer, createKnownOfferContext } from './src/lib/catalog/on-demand/worker';", resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'esm', write: false, packages: 'external',
  plugins: [{ name: 'server-only-in-readonly-probe', setup(b) {
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'empty', namespace: 'probe' }));
    b.onLoad({ filter: /.*/, namespace: 'probe' }, () => ({ contents: '' }));
  } }],
});
const code = bundle.outputFiles[0].text;
await writeFile(`${folder}/reader.mjs`, code);
const { fetchKnownOffer, createKnownOfferContext } = await import(`${folder}/reader.mjs`);
const nativeFetch = globalThis.fetch;
const context = new AsyncLocalStorage();
const gates = new Map();
const captures = [];
const results = [];
const trace = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
function checkRequest(input, options, store) {
  const u = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  const host = u.hostname.replace(/^www\./, '');
  const allowed = store.allowedListingHosts ?? [new URL(store.baseUrl).hostname.replace(/^www\./, '')];
  assert(u.protocol === 'https:' && !u.username && !u.password && !u.port, 'Destino público HTTPS obligatorio');
  assert(allowed.includes(host) || (store.storeId === 'compragamer' && host === 'static.compragamer.com'), 'Host ajeno a la tienda');
  assert(!/\/(?:cart|carrito|checkout|wp-admin|wp-login|account|mi-cuenta)(?:[/.]|$)/i.test(u.pathname), 'Ruta fuera del corte de catálogo');
  const method = String(options.method ?? 'GET').toUpperCase();
  if (!['GET', 'HEAD'].includes(method)) {
    // Método de consulta pública ya utilizado por el adaptador Maximus, sin cuenta.
    const body = JSON.parse(options.body ?? '{}');
    const params = JSON.parse(body.JSonParameters ?? '{}');
    assert(store.storeId === 'maximus' && method === 'POST' && u.pathname === '/wfmWebSite2.aspx/wsNRW_Script'
      && ['web.MAX.GetItemList4Search_v3', 'web.MAX.GetItemDetail_V6'].includes(body.strScriptLabel)
      && params.cust_id === -1, 'Sólo consulta anónima Maximus');
    if (body.strScriptLabel === 'web.MAX.GetItemDetail_V6') assert(Number.isSafeInteger(params.item_id) && params.item_id > 0, 'Detalle requiere ID exacto');
  }
  return u;
}
globalThis.fetch = async (input, options = {}) => {
  const task = context.getStore();
  assert(task, 'Toda solicitud debe pertenecer a una tienda');
  let u = checkRequest(input, options, task.store);
  const host = u.hostname.replace(/^www\./, '');
  const gate = gates.get(host) ?? { tail: Promise.resolve(), nextAt: 0 };
  gates.set(host, gate);
  const previous = gate.tail;
  let release;
  gate.tail = new Promise(r => { release = r; });
  await previous;
  try {
    if (gate.nextAt > Date.now()) await sleep(gate.nextAt - Date.now());
    assert(task.requests < 4, 'PROBE_REQUEST_BUDGET');
    task.requests++;
    const started = Date.now();
    const row = { storeId: task.store.storeId, url: u.href, method: options.method ?? 'GET', at: new Date(started).toISOString() };
    trace.push(row);
    const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000);
    try {
      const response = await nativeFetch(u.href, { ...options, redirect: 'manual', signal });
      row.status = response.status;
      row.ms = Date.now() - started;
      if ([301, 302, 303, 307, 308].includes(response.status) && options.redirect !== 'manual') {
        const location = response.headers.get('location');
        await response.body?.cancel();
        assert(location, 'Redirección sin destino');
        u = checkRequest(new URL(location, u), { method: 'GET' }, task.store);
        // Libera el gate antes de la siguiente solicitud; cada salto consume presupuesto.
        gate.nextAt = Date.now() + 2000;
        release();
        release = () => {};
        return await globalThis.fetch(u.href, { ...options, method: 'GET', body: undefined });
      }
      if (options.method === 'HEAD' || response.status === 304 || (response.status >= 300 && response.status < 400)) return response;
      const chunks = [];
      let bytes = 0;
      const reader = response.body?.getReader();
      try {
        if (reader) for (;;) {
          const part = await reader.read();
          if (part.done) break;
          bytes += part.value.byteLength;
          assert(bytes <= 16000000, 'PROBE_BYTE_BUDGET');
          chunks.push(part.value);
        }
      } finally { await reader?.cancel().catch(() => {}); }
      const body = Buffer.concat(chunks);
      row.bytes = bytes;
      row.ms = Date.now() - started;
      const file = `${task.store.storeId}-${task.requests}.txt`;
      await writeFile(`${folder}/responses/${file}`, body);
      captures.push({ ...row, file, sha256: createHash('sha256').update(body).digest('hex') });
      const recreated = new Response(body, { status: response.status, headers: response.headers });
      Object.defineProperty(recreated, 'url', { value: response.url });
      return recreated;
    } catch (error) {
      row.failure = error.name === 'TimeoutError' ? 'timeout' : 'network-or-bound';
      row.ms = Date.now() - started;
      throw error;
    }
  } finally { gate.nextAt = Date.now() + 2000; release(); }
};
async function audit(store) {
  const task = { store, requests: 0 };
  return context.run(task, async () => {
    let sample = samples.find(s => s.store_id === store.storeId);
    const result = { storeId: store.storeId, name: store.name, platform: store.platform, storedTarget: Boolean(sample) };
    try {
      if (!sample) {
        const response = await fetch(store.baseUrl, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' } });
        result.discoveryStatus = response.status;
        const $ = cheerio.load(await response.text());
        const match = $('a[href]').toArray().map(a => ({ url: new URL($(a).attr('href'), store.baseUrl).href, name: $(a).text().replace(/\s+/g, ' ').trim() }))
          .find(a => a.name.length >= 8 && new URL(a.url).hostname.replace(/^www\./, '') === new URL(store.baseUrl).hostname.replace(/^www\./, '') && /\/(?:productos?|product)\/[^/]+\/?$/.test(new URL(a.url).pathname));
        if (!match) { result.state = 'no-real-listing-target'; return result; }
        sample = { store_id: store.storeId, product_id: `probe-${store.storeId}`, name: match.name, url: match.url, category: 'perifericos', specs: {} };
        result.discoveredTarget = true;
      }
      result.target = { url: sample.url, name: sample.name, category: sample.category, originalObservedAt: sample.last_updated ?? null };
      const product = { id: sample.product_id, name: sample.name, category: sample.category, brand: sample.brand ?? 'Generica', model: sample.model ?? sample.name,
        specs: sample.specs ?? {}, description: sample.name, prices: [], lowestPrice: 0, highestPrice: 0, averagePrice: 0, createdAt: new Date(), updatedAt: new Date() };
      const readerContext = createKnownOfferContext(true);
      const start = Date.now();
      const found = await fetchKnownOffer(product, { productId: product.id, storeId: store.storeId, url: sample.url }, start, readerContext);
      result.elapsedMs = Date.now() - start;
      result.state = found ? 'read-observation' : 'no-observation';
      result.failure = readerContext.failures.get(sample.url) ?? null;
      if (found) result.observation = { name: found.sourceTitle, price: found.price.price, stock: found.price.stock, observedAt: found.price.lastUpdated,
        sourceIdentity: found.price.sourceIdentity, priceCondition: found.price.priceCondition ?? 'unspecified', identityReview: found.price.identityReview ?? null };
    } catch (error) { result.state = 'probe-failed'; result.failure = error.name; }
    finally {
      result.requests = task.requests;
      results.push(result);
      await writeFile(`${folder}/progress.json`, JSON.stringify({ results, trace, captures }, null, 2));
    }
    return result;
  });
}
try {
  const queue = [...inventory.stores];
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (queue.length) {
      const result = await audit(queue.shift());
      process.stdout.write(`${result.storeId}: ${result.state}, ${result.requests} requests\n`);
    }
  }));
} finally { globalThis.fetch = nativeFetch; }
await writeFile(`${folder}/report.json`, JSON.stringify({ at: new Date().toISOString(), mode: 'bounded-source-readonly-no-db-no-persistence', stores: inventory.stores.length,
  limits: 'One stored/discovered publication per store; <=4 requests/store including redirects, 3 stores in parallel, 2s between requests/host. Does not certify an entire catalog or persisted freshness.',
  readerSha256: createHash('sha256').update(code).digest('hex'), results: results.sort((a, b) => a.storeId.localeCompare(b.storeId)), trace, captures }, null, 2));
assert.equal(results.length, inventory.stores.length);
