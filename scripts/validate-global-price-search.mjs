import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { parse } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Sólo lecturas RPC anónimas. No cache HTTP, scraping ni credenciales privadas.
const source = process.env.PUBLIC_CATALOG_ENV_FILE
  ? parse(await readFile(process.env.PUBLIC_CATALOG_ENV_FILE, 'utf8')) : process.env;
const url = source.NEXT_PUBLIC_SUPABASE_URL;
const key = source.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? source.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('Falta configuración pública del catálogo');
const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', signal: AbortSignal.timeout(9500) }) },
});
const defaults = { p_query: '', p_category: null, p_stores: [], p_min_price: 100000,
  p_max_price: null, p_sort: 'price-asc', p_page: 1, p_page_size: 12 };
const cases = [
  ['global-ascending', {}], ['global-next-page', { p_page: 2 }],
  ['global-descending', { p_sort: 'price-desc' }],
  ['global-range', { p_min_price: 100137, p_max_price: 300000 }],
  ['global-max-only', { p_min_price: null, p_max_price: 200000 }],
  ['global-name', { p_min_price: 0, p_sort: 'name' }],
  ['global-newest', { p_min_price: 0, p_sort: 'newest' }],
  ['global-relevance', { p_min_price: 0, p_sort: 'relevance' }],
  ['cpu-category', { p_category: 'procesadores', p_min_price: 0 }],
  ['gpu-category', { p_category: 'tarjetas-graficas', p_min_price: 0 }],
  ['ram-category', { p_category: 'memoria-ram', p_min_price: 0 }],
  ['store-filter', { p_stores: ['mexx'] }],
  ['gpu-text', { p_query: 'rtx 5090', p_category: 'tarjetas-graficas', p_min_price: 0 }],
  ['cpu-text', { p_query: 'ryzen', p_category: 'procesadores', p_max_price: 200000 }],
  ['empty-clamps-page', { p_min_price: 999999999, p_page: 999 }],
];
const results = [];
for (const [name, overrides] of cases) {
  if (results.length) await pause(1000);
  const params = { ...defaults, ...overrides };
  const started = performance.now();
  try {
    const { data, error } = await client.rpc('search_catalog_page', params);
    if (error) throw new Error(`${error.code}: ${error.message}`);
    const ms = Math.round(performance.now() - started);
    const products = data?.products;
    const prices = products?.map(p => Number(p.lowest_price)) ?? [];
    const ids = products?.map(p => p.id) ?? [];
    const now = Date.now();
    const assertions = {
      shape: Array.isArray(products) && Number.isInteger(data.total) && data.total >= 0,
      limit: products?.length <= params.p_page_size,
      pages: data.totalPages === Math.ceil(data.total / params.p_page_size),
      clamp: data.page === Math.max(1, Math.min(params.p_page, Math.max(data.totalPages, 1))),
      unique: new Set(ids).size === ids.length,
      prices: prices.every(p => Number.isFinite(p) && p > 0),
      range: prices.every(p => (params.p_min_price === null || p >= params.p_min_price) &&
        (params.p_max_price === null || p <= params.p_max_price)),
      sort: prices.every((p, i) => !i || !['price-asc', 'price-desc'].includes(params.p_sort) ||
        (params.p_sort === 'price-asc' ? prices[i - 1] <= p : prices[i - 1] >= p)),
      category: products?.every(p => params.p_category === null || p.category === params.p_category),
      stores: products?.every(p => p.product_prices?.every(o => !params.p_stores.length || params.p_stores.includes(o.store_id.toLowerCase()))),
      observedOffer: products?.every(p => p.product_prices?.some(o => Number(o.price) > 0 &&
        ['in-stock', 'low-stock'].includes(o.stock) && Date.parse(o.last_updated) >= now - 86400000 &&
        Date.parse(o.last_updated) <= now + 60000)),
      timeout: ms < 8000,
      empty: name !== 'empty-clamps-page' || data.total === 0,
    };
    results.push({ name, params, ms, total: data.total, page: data.page, totalPages: data.totalPages,
      ids, prices, assertions, passed: Object.values(assertions).every(Boolean) });
  } catch (error) {
    results.push({ name, params, ms: Math.round(performance.now() - started), passed: false, error: error.message });
  }
  console.log(JSON.stringify(results.at(-1)));
}
const first = results.find(r => r.name === 'global-ascending');
const second = results.find(r => r.name === 'global-next-page');
const pagination = !!first?.passed && !!second?.passed && first.total === second.total &&
  !first.ids.some(id => second.ids.includes(id)) && first.prices.at(-1) <= second.prices[0];
const report = { at: new Date().toISOString(), role: 'anon', cache: 'direct RPC POST / no-store',
  requestSpacingMs: 1000, results, pagination, passed: results.every(r => r.passed) && pagination };
const output = resolve(process.env.PUBLIC_CATALOG_OUTPUT_DIR ?? 'outputs/search-price-fix-2026-10-06');
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'direct-rpc-matrix.json'), JSON.stringify(report, null, 2));
process.exitCode = report.passed ? 0 : 1;
