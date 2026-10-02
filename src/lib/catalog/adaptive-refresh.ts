import 'server-only';
import { randomUUID } from 'node:crypto';
import { getServerSupabaseServiceClient } from '@/lib/server/supabase-server';
import { PRODUCT_SELECT_FIELDS } from '@/lib/persistence/product-read-helpers';
import { mapDbProduct } from '@/lib/persistence/product-read-mapper';
import type { DbProductRow } from '@/lib/persistence/product-read-types';
import { buildPriceStateSignature } from '@/lib/persistence/product-write-dedupe';
import { reviewProductOffers } from '@/lib/ai/review-product-offers';
import { isComparableStoreOffer } from '@/lib/price-utils';
import { isCatalogOfferFresh } from '@/lib/price-freshness';
import { withConcurrencyLimit } from '@/lib/async/concurrency';
import { WOO_BATCH_STORES } from '@/lib/scrapers/woocommerce-known-batch';
import { runInventoryDiscovery } from './inventory-discovery';
import { runInventoryDetailDiscovery } from './inventory-detail-discovery';
import { createKnownOfferContext, fetchKnownOffer, prepareKnownOfferBatch } from './on-demand/worker';

type Target = { offer_id: string; product_id: string; store_id: string; url: string; interval_hours: number; reason: string };
type Outcome = 'observed' | 'no-observation' | 'source-failed' | 'persist-failed' | 'unsupported';
type Counts = { attempted: number; observed: number; comparable: number; failures: Record<string, number> };
const emptyCounts = (): Counts => ({ attempted: 0, observed: 0, comparable: 0, failures: {} });

export async function runAdaptiveRefresh(options: { maxOffers?: number; maxRunMs?: number } = {}) {
  if (process.env.CATALOG_REQUESTED_RUNNER !== '1') throw new Error('REFRESH_RUNNER_REQUIRED');
  const client = getServerSupabaseServiceClient();
  if (!client) throw new Error('REFRESH_DATABASE_UNAVAILABLE');
  const requestedLimit = options.maxOffers ?? Number(process.env.CATALOG_ADAPTIVE_MAX_OFFERS ?? 2500);
  if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 5000) throw new Error('REFRESH_INVALID_LIMIT');
  const maxOffers = requestedLimit;
  const deadline = Math.min(17 * 60_000, Math.max(1000, options.maxRunMs ?? 17 * 60_000));
  const started = Date.now(), token = randomUUID(), startedAt = new Date(started).toISOString();
  // Sólo se compactan resúmenes operativos generados por esta cola.
  const cleanup = await client.from('catalog_refresh_runs').delete()
    .lt('started_at',new Date(started-30*86400000).toISOString());
  if (cleanup.error) throw new Error('REFRESH_RUN_RETENTION_FAILED');
  const interrupted = await client.from('catalog_refresh_runs').update({ status:'failed',finished_at:startedAt })
    .eq('status','running').lt('started_at',new Date(started-60*60_000).toISOString());
  if (interrupted.error) throw new Error('REFRESH_PROGRESS_FAILED');
  const inventory = process.env.CATALOG_INVENTORY_DISCOVERY === '1' ? await runInventoryDiscovery() : [];
  const inventoryDetails = process.env.CATALOG_INVENTORY_DISCOVERY === '1' ? await runInventoryDetailDiscovery() : undefined;
  let seeded = 0;
  for (let batch = 0; ; batch++) {
    if (batch >= 200 || Date.now() - started >= deadline) throw new Error('REFRESH_SEED_DEADLINE');
    let result = await client.rpc('seed_catalog_refresh_queue');
    // La preparación es idempotente: una respuesta perdida no duplica ofertas.
    for (let retry=0; result.error && retry<2 && Date.now()-started<deadline; retry++) {
      await new Promise(resolve=>setTimeout(resolve,500 * (retry+1)));
      result=await client.rpc('seed_catalog_refresh_queue');
    }
    if (result.error) throw new Error(result.error.code==='57014' ? 'REFRESH_SEED_TIMEOUT' : 'REFRESH_SEED_FAILED');
    if (!Number.isSafeInteger(result.data) || result.data < 0 || result.data > 500) throw new Error('REFRESH_INVALID_SEED_RESULT');
    seeded += result.data;
    if (result.data === 0) break;
  }
  const run = await client.from('catalog_refresh_runs').insert({ started_at: startedAt }).select('id').single();
  if (run.error || !run.data) throw new Error('REFRESH_RUN_CREATE_FAILED');
  const counts = emptyCounts(), groups: Record<string, Counts> = {}, context = createKnownOfferContext(true);
  const storeReady = new Map<string, Promise<void>>();
  let taskFailed = false;
  let failureCode: string | undefined;
  let feedClaimed = 0, feedPhase = true;
  // Al menos la mitad del presupuesto queda para la rotación de otras tiendas.
  const feedLimit = Math.min(1200, Math.floor(maxOffers / 2));
  let status: 'completed' | 'deadline' | 'failed' = 'completed';
  async function finish(target: Target, outcome: Outcome, comparable = false) {
    let finished = await client!.rpc('finish_catalog_refresh', { p_offer_id: target.offer_id, p_token: token, p_result: outcome });
    // La RPC confirma el mismo token sin repetir el cambio si la respuesta se perdió.
    for (let retry=0; finished.error && retry<2; retry++) {
      await new Promise(resolve=>setTimeout(resolve,300 * (retry+1)));
      finished=await client!.rpc('finish_catalog_refresh', { p_offer_id: target.offer_id, p_token: token, p_result: outcome });
    }
    if (finished.error) throw new Error('REFRESH_FINISH_FAILED');
    if (finished.data !== true) throw new Error('REFRESH_LEASE_LOST');
    const group = groups[`${target.store_id}:${target.reason}`] ??= emptyCounts();
    for (const scope of [counts, group]) {
      scope.attempted++;
      if (outcome === 'observed') scope.observed++;
      else scope.failures[outcome] = (scope.failures[outcome] ?? 0) + 1;
      if (comparable) scope.comparable++;
    }
  }
  try {
    while (counts.attempted < maxOffers && Date.now() - started < deadline) {
      if (feedClaimed >= feedLimit) feedPhase = false;
      const claimed = await client.rpc(feedPhase ? 'claim_catalog_feed_refresh' : 'claim_catalog_refresh', { p_token: token,
        p_limit: Math.min(24, maxOffers - counts.attempted, feedPhase ? feedLimit-feedClaimed : 24) });
      if (claimed.error) throw new Error('REFRESH_CLAIM_FAILED');
      const targets = claimed.data as Target[];
      if (!targets?.length) { if (feedPhase) { feedPhase=false; continue; } break; }
      if (feedPhase) feedClaimed += targets.length;
      const ids = [...new Set(targets.map(target => target.product_id))];
      const read = await client.from('products').select(PRODUCT_SELECT_FIELDS).in('id', ids).limit(ids.length);
      if (read.error) throw new Error('REFRESH_READ_FAILED');
      const products = new Map((read.data as unknown as DbProductRow[]).map(row => { const product = mapDbProduct(row); return [product.id, product]; }));
      await prepareKnownOfferBatch(products,targets.map(target=>({productId:target.product_id,storeId:target.store_id,url:target.url})),context);
      const observations = await withConcurrencyLimit(targets.map(target => async () => {
        // Se serializa cada tienda incluso para adaptadores antiguos que aún
        // no usan sourceFetch. Otras tiendas pueden avanzar en paralelo.
        const previous = storeReady.get(target.store_id) ?? Promise.resolve();
        let release!: () => void;
        const next = new Promise<void>(resolve => { release = resolve; });
        storeReady.set(target.store_id, next);
        await previous;
        try {
          if (taskFailed || Date.now() - started >= deadline) return null;
          const product = products.get(target.product_id);
          const observation = product ? await fetchKnownOffer(product, { productId: target.product_id, storeId: target.store_id, url: target.url }, started, context).catch(() => null) : null;
          if (!observation) { await finish(target, context.failures.get(target.url) === 'no-observation' ? 'no-observation' : 'source-failed'); return null; }
          return { target, ...observation };
        } catch {
          taskFailed = true; return null;
        } finally {
          // CompraGamer comparte la lectura de catálogo; no se duerme por fila.
          if (target.store_id !== 'compragamer' && !WOO_BATCH_STORES.has(target.store_id)) await new Promise(resolve => setTimeout(resolve, 2000));
          release();
        }
      }), 3);
      if (taskFailed) throw new Error('REFRESH_BATCH_FAILED');
      const observed = observations.filter(item => item !== null);
      // Lotes pequeños respetan el máximo de revisión de identidad existente.
      for (let offset = 0; offset < observed.length; offset += 8) {
        const batch = observed.slice(offset, offset + 8);
        const reviewed = await reviewProductOffers(batch.map(item => item.product), { authorizedRefresh: true,
          sourceTitles: Object.fromEntries(batch.map(item => [item.price.url, item.sourceTitle])) });
        for (let index = 0; index < batch.length; index++) {
          const item = batch[index], price = reviewed[index].prices[0];
          const state = { price: price.price, original_price: price.originalPrice ?? null, stock: price.stock,
            installment_count: price.installment?.count ?? null, installment_amount: price.installment?.amount ?? null };
          const persist = () => client.rpc('persist_adaptive_offer', {
            p_offer_id: item.target.offer_id, p_token: token,
            p_price: state.price, p_original_price: state.original_price, p_stock: state.stock,
            p_installment_count: state.installment_count, p_installment_amount: state.installment_amount,
            p_run_started_at: startedAt, p_observed_at: new Date(price.lastUpdated).toISOString(),
            p_review: price.identityReview ?? null, p_signature: buildPriceStateSignature(state),
            p_source_identity: price.sourceIdentity ?? null, p_price_condition: price.priceCondition ?? (price.storeId === 'compragamer' ? 'special' : 'unspecified'),
          });
          let persisted=await persist();
          // Repetir la misma observación no inserta otro historial; su fecha se conserva.
          for (let retry=0; persisted.error && retry<2; retry++) {
            await new Promise(resolve=>setTimeout(resolve,300 * (retry+1)));
            persisted=await persist();
          }
          const saved = !persisted.error && persisted.data === true;
          await finish(item.target, saved ? 'observed' : 'persist-failed', saved && isCatalogOfferFresh(price.lastUpdated) && isComparableStoreOffer(price, item.product));
        }
      }
      // El avance persiste por lote aunque el runner se interrumpa luego.
      const progress = await client.from('catalog_refresh_runs').update({ summary: { ...counts, groups, sharedReads: context.sharedReads } }).eq('id', run.data.id);
      if (progress.error) throw new Error('REFRESH_PROGRESS_FAILED');
    }
    if (Date.now() - started >= deadline) status = 'deadline';
    if (counts.attempted > 0 && counts.observed === 0) status = 'failed';
  } catch (error) {
    failureCode = error instanceof Error && /^REFRESH_[A-Z_]+$/.test(error.message) ? error.message : 'REFRESH_UNEXPECTED_ERROR';
    status = 'failed';
  } finally {
    const released = await client.from('catalog_offer_refresh_state').update({ lease_token: null, leased_until: null }).eq('lease_token', token);
    if (released.error) status = 'failed';
  }
  const coverage = await client.rpc('catalog_refresh_coverage');
  if (coverage.error) status = 'failed';
  if (inventory.some(item => item.status === 'failed')) status = 'failed';
  if (inventoryDetails?.status === 'failed') status = 'failed';
  const sourceFailureReasons: Record<string,number> = {};
  for (const reason of context.failures.values()) sourceFailureReasons[reason]=(sourceFailureReasons[reason] ?? 0)+1;
  const summary = { source: 'adaptive-catalog', trigger: ['github-schedule','cloudflare-fallback'].includes(process.env.CATALOG_RUN_TRIGGER ?? '') ? process.env.CATALOG_RUN_TRIGGER : 'manual', runId: run.data.id, startedAt, finishedAt: new Date().toISOString(),
    status, failureCode, inventory, inventoryDetails, feedClaimed, sourceFailureReasons, limitReached: counts.attempted >= maxOffers, ...counts, groups, seeded, sharedReads: context.sharedReads, coverage: coverage.data ?? [] };
  const completed = await client.from('catalog_refresh_runs').update({ status, finished_at: summary.finishedAt, summary }).eq('id', run.data.id);
  if (completed.error) throw new Error('REFRESH_PROGRESS_FAILED');
  return summary;
}
