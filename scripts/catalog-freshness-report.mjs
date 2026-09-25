import { createClient } from '@supabase/supabase-js';
import { writeFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const valueAfter = (flag) => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
const since = valueAfter('--since');
const outputPath = valueAfter('--output');
const requireObserved = args.includes('--require-observed');
const now = new Date();
if (since && (!Number.isFinite(Date.parse(since)) || Date.parse(since) > now.getTime())) {
  throw new Error('El inicio de la ventana debe ser una fecha ISO anterior al corte.');
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Falta la configuración de lectura del catálogo.');
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: stores, error: storesError } = await supabase.from('stores').select('id,name').order('id');
if (storesError) throw storesError;

const cutoff3h = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
function availableQuery(storeId) {
  return supabase.from('product_prices').select('id', { head: true, count: 'exact' })
    .eq('store_id', storeId).in('stock', ['in-stock', 'low-stock']).gt('price', 0);
}

const byStore = [];
for (const store of stores ?? []) {
  const [available, fresh24h, fresh3h, identityPending3h] = await Promise.all([
    availableQuery(store.id),
    availableQuery(store.id).gte('last_updated', cutoff24h).lte('last_updated', now.toISOString()),
    availableQuery(store.id).gte('last_updated', cutoff3h).lte('last_updated', now.toISOString()),
    availableQuery(store.id).gte('last_updated', cutoff3h).lte('last_updated', now.toISOString())
      .eq('identity_review->>status', 'needs-review'),
  ]);
  const failed = [available, fresh24h, fresh3h, identityPending3h].find((result) => result.error);
  if (failed) throw failed.error;
  if (!available.count) continue;
  byStore.push({ storeId: store.id, available: available.count, fresh24h: fresh24h.count ?? 0,
    fresh3h: fresh3h.count ?? 0, identityPending3h: identityPending3h.count ?? 0 });
}

const observedByStore = {};
const observedProducts = new Set();
if (since) {
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from('product_prices').select('store_id,product_id')
      .gte('last_updated', since).lte('last_updated', now.toISOString())
      .order('last_updated', { ascending: true }).order('id', { ascending: true }).range(offset, offset + 999);
    if (error) throw error;
    for (const row of data ?? []) {
      observedByStore[row.store_id] = (observedByStore[row.store_id] ?? 0) + 1;
      observedProducts.add(row.product_id);
    }
    if (!data || data.length < 1000) break;
  }
}

const sum = (field) => byStore.reduce((total, row) => total + row[field], 0);
const report = {
  measuredAt: now.toISOString(), definition: 'Ofertas almacenadas con precio positivo y stock disponible; frescura según last_updated. candidateComparable3h excluye status needs-review pero no verifica identidad contra el producto ni render público.',
  denominator: sum('available'), fresh24h: sum('fresh24h'), fresh3h: sum('fresh3h'),
  identityPending3h: sum('identityPending3h'),
  candidateComparable3h: sum('fresh3h') - sum('identityPending3h'),
  ...(since ? { windowStart: since, observedRows: Object.values(observedByStore).reduce((total, count) => total + count, 0),
    persistedProducts: observedProducts.size, observedByStore } : {}),
  byStore,
};
console.log(JSON.stringify(report));
if (outputPath) await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    '### Frescura del catálogo',
    `Corte: ${report.measuredAt}. Denominador: ${report.denominator} ofertas disponibles almacenadas.`,
    `≤24 h: ${report.fresh24h}; ≤3 h: ${report.fresh3h}; pendientes de identidad entre las de 3 h: ${report.identityPending3h}.`,
    ...(since ? [`Observaciones persistidas desde ${since}: ${report.observedRows}; productos distintos: ${report.persistedProducts}.`] : []),
    '', '| Tienda | Disponibles | ≤24 h | ≤3 h | Identidad pendiente ≤3 h | Observadas en ciclo |',
    '|---|---:|---:|---:|---:|---:|',
    ...byStore.map((row) => `| ${row.storeId} | ${row.available} | ${row.fresh24h} | ${row.fresh3h} | ${row.identityPending3h} | ${observedByStore[row.storeId] ?? 0} |`),
  ];
  await writeFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`, { flag: 'a' });
}
if (requireObserved && report.observedRows === 0) {
  process.stderr.write('El ciclo no persistió ninguna observación de precio.\n');
  process.exitCode = 2;
}
