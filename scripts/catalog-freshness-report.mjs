import { createClient } from '@supabase/supabase-js';
import { readFile, writeFile } from 'node:fs/promises';
import { createObservedOfferSummary } from './lib/observed-offers.mjs';
import { loadG02SampleEvaluator } from './lib/load-g02-sample.mjs';
import { readRunnerEvidence } from './lib/freshness-report-policy.mjs';

const args = process.argv.slice(2);
const valueAfter = (flag) => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
const since = valueAfter('--since');
const outputPath = valueAfter('--output');
const samplePath = valueAfter('--sample');
const runnerPath = valueAfter('--runner-result');
const mode = valueAfter('--mode');
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
const measuredStoreIds = new Set((stores ?? []).map(store => store.id));

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
  if ([available, fresh24h, fresh3h, identityPending3h].some(result => !Number.isInteger(result.count) || result.count < 0)) {
    throw new Error('No se recibió un conteo exacto de frescura; no se convierte una medición ausente en cero.');
  }
  if (!available.count) continue;
  byStore.push({ storeId: store.id, available: available.count, fresh24h: fresh24h.count ?? 0,
    fresh3h: fresh3h.count ?? 0, identityPending3h: identityPending3h.count ?? 0 });
}

const observations = createObservedOfferSummary();
if (since) {
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from('product_prices').select('store_id,product_id,price,stock')
      .gte('last_updated', since).lte('last_updated', now.toISOString())
      .order('last_updated', { ascending: true }).order('id', { ascending: true }).range(offset, offset + 999);
    if (error) throw error;
    observations.add(data ?? []);
    if (!data || data.length < 1000) break;
  }
}
const observedSummary = observations.getSummary();
const { observedByStore } = observedSummary;

const sum = (field) => byStore.reduce((total, row) => total + row[field], 0);
let sample;
if (samplePath) {
  const configured = JSON.parse(await readFile(samplePath, 'utf8'));
  const products = configured?.products;
  if (!Array.isArray(products) || products.length < 1 || products.length > 30
    || products.some((item) => typeof item?.id !== 'string' || !/^[\w.-]{1,240}$/.test(item.id)
      || typeof item.category !== 'string')
    || new Set(products.map((item) => item.id)).size !== products.length) throw new Error('Muestra prioritaria inválida.');
  const ids = products.map((item) => item.id);
  const { data: catalogRows, error: catalogError } = await supabase.from('products').select('id,name,category').in('id', ids);
  if (catalogError) throw catalogError;
  const catalogById = new Map((catalogRows ?? []).map((row) => [row.id, row.category]));
  if (products.some((item) => catalogById.get(item.id) !== item.category)) throw new Error('Una ficha de la muestra no existe o cambió de categoría.');
  const prices = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from('product_prices')
      .select('id,product_id,store_id,url,price,stock,last_updated,identity_review,source_identity').in('product_id', ids)
      .order('id', { ascending: true }).range(offset, offset + 999);
    if (error) throw error;
    prices.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const evaluateSample = await loadG02SampleEvaluator();
  sample = { source: samplePath, selectedAtUtc: configured.selectedAtUtc,
    definition: 'Ofertas almacenadas disponibles de fichas fijas; identityAccepted3h exige revisión válida ligada a producto/URL y título observado, sin contradicción explícita. No acredita compra real ni render público.',
    ...evaluateSample(products.map(item => catalogRows.find(row => row.id === item.id)), prices, now.toISOString()) };

}
const report = {
  status: 'measured',
  ...(mode ? { mode } : {}),
  measuredAt: now.toISOString(), definition: 'Ofertas almacenadas con precio positivo y stock disponible; frescura según last_updated. candidateComparable3h excluye status needs-review pero no verifica identidad contra el producto ni render público.',
  denominator: sum('available'), fresh24h: sum('fresh24h'), fresh3h: sum('fresh3h'),
  identityPending3h: sum('identityPending3h'),
  candidateComparable3h: sum('fresh3h') - sum('identityPending3h'),
  ...(since ? { windowStart: since,
    observationDefinition: 'Filas de precio actualizadas en la ventana, con o sin disponibilidad; pueden proceder de otros runners. No atribuye autoría a este ciclo. availableObservedRows solo cuenta stock disponible y precio positivo, sin acreditar identidad ni compra real.',
    observationAttribution: 'window-only-not-runner-authorship',
    ...observedSummary } : {}),
  ...(runnerPath ? { runnerEvidence: await readRunnerEvidence(runnerPath) } : {}),
  ...(sample ? { sample } : {}),
  byStore,
};
console.log(JSON.stringify(report));
if (outputPath) await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    '### Frescura del catálogo',
    `Corte: ${report.measuredAt}. Denominador: ${report.denominator} ofertas disponibles almacenadas.`,
    `≤24 h: ${report.fresh24h}; ≤3 h: ${report.fresh3h}; pendientes de identidad entre las de 3 h: ${report.identityPending3h}.`,
    ...(sample ? [`Muestra prioritaria fija: ${sample.fresh24h}/${sample.denominator} ofertas disponibles observadas ≤24 h; ${sample.fresh3h} ≤3 h. Identidad aceptada: ${sample.identityAccepted3h}; fichas con una oferta aceptada reciente: ${sample.productsWithAcceptedOffer3h}/${sample.byProduct.length}.`] : []),
    ...(since ? [`Filas actualizadas en la ventana desde ${since}: ${report.observedRows}; productos distintos: ${report.persistedProducts}; filas disponibles: ${report.availableObservedRows}. Pueden proceder de otros runners; no acredita autoría del ciclo.`] : []),
    ...(report.runnerEvidence ? [report.runnerEvidence.status === 'available'
      ? `Recibo propio (${report.runnerEvidence.source}): intentos ${report.runnerEvidence.attempted}; observaciones guardadas ${report.runnerEvidence.observed}; comparables ${report.runnerEvidence.comparable}.`
      : `Recibo propio no disponible: ${report.runnerEvidence.reason}.`] : []),
    '', '| Tienda | Disponibles | ≤24 h | ≤3 h | Identidad pendiente ≤3 h | Filas de la ventana | Productos distintos de la ventana | Filas disponibles de la ventana |',
    '|---|---:|---:|---:|---:|---:|---:|---:|',
    ...[...new Set([...byStore.map(row => row.storeId), ...Object.keys(observedByStore)])].sort().map(id => {
      const row = byStore.find(store => store.storeId === id);
      const absent = measuredStoreIds.has(id) ? 0 : 'no verificado';
      return `| ${id} | ${row?.available ?? absent} | ${row?.fresh24h ?? absent} | ${row?.fresh3h ?? absent} | ${row?.identityPending3h ?? absent} | ${observedByStore[id] ?? 0} | ${observedSummary.persistedProductsByStore[id] ?? 0} | ${observedSummary.availableObservedByStore[id] ?? 0} |`;
    }),
  ];
  await writeFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`, { flag: 'a' });
}
if (requireObserved && report.observedRows === 0) {
  process.stderr.write('No hay filas de precio actualizadas en la ventana medida; este control no atribuye autoría al runner.\n');
  process.exitCode = 2;
}
