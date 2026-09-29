import 'server-only';
import { getServerSupabaseServiceClient } from '@/lib/server/supabase-server';
import { BUDGET_GUIDES } from '@/lib/seo/budget-guides-data';
import { loadGuideCatalogProducts } from '@/lib/seo/guide-catalog';
import { readProductByIdFromDatabase } from '@/lib/persistence/product-read';
import { reviewProductOffers } from '@/lib/ai/review-product-offers';
import { buildPriceStateSignature } from '@/lib/persistence/product-write-dedupe';
import { needsIdentityReview } from '@/lib/quality/offer-identity';
import { isOfferFresh } from '@/lib/price-freshness';
import { fetchKnownOffer } from './on-demand/worker';
import type { RefreshItemResult, RefreshTarget } from './on-demand/contracts';
import { nextPriorityTargets, planGuideGroups, planSampleTargets, targetKey, PRIORITY_MAX_GUIDE_OFFERS, PRIORITY_MAX_SAMPLE_OFFERS, type PriorityGroup } from './priority-planning';
import type { Product } from '@/lib/types';
import sample from '../../../docs/reports/crecimiento-2026-09-12/G02-MUESTRA-PRIORITARIA.json';

const MAX_RUN_MS = 18 * 60_000;
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function runPriorityRefresh(includeSample: boolean) {
  if (process.env.ENABLE_JEV_OFFER_REVIEW !== '1' || !process.env.TYPESAFE_API_KEY?.trim()) {
    throw new Error('PRIORITY_REVIEW_UNAVAILABLE');
  }
  const client = getServerSupabaseServiceClient();
  if (!client) throw new Error('PRIORITY_DATABASE_UNAVAILABLE');
  const supabase = client;
  // También cubre ejecuciones manuales o procesos distintos del mismo runner.
  const gate = await supabase.rpc('check_api_rate_limit', {
    p_bucket_key: 'catalog-priority-refresh-30m', p_limit: 1, p_window_seconds: 1800,
  });
  if (gate.error || !gate.data?.allowed) throw new Error('PRIORITY_REFRESH_DEFERRED');
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const products = new Map<string, Product>();
  const groups: PriorityGroup[] = [];
  for (const guide of BUDGET_GUIDES) {
    const catalog = await loadGuideCatalogProducts(guide);
    catalog.forEach(product => products.set(product.id, product));
    groups.push(...planGuideGroups(guide, catalog, started));
  }
  const attempted = new Set<string>();
  const results: RefreshItemResult[] = [];
  let deadlineReached = false;

  async function refreshBatch(targets: RefreshTarget[]) {
    const observations = [];
    for (const target of targets) {
      if (Date.now() - started >= MAX_RUN_MS) { deadlineReached = true; break; }
      if (attempted.has(targetKey(target))) continue;
      attempted.add(targetKey(target));
      const product = products.get(target.productId);
      const observed = product ? await fetchKnownOffer(product, target, started).catch(() => null) : null;
      if (observed) observations.push({ ...observed, target });
      else results.push({ ...target, state: 'failed', observedAt: null, comparable: false });
      await wait(2_000);
    }
    const reviewable = observations.filter(item => item.price.identityReview?.reason !== 'explicit-conflict');
    const reviewed = await reviewProductOffers(reviewable.map(item => item.product), { authorizedRefresh: true,
      sourceTitles: Object.fromEntries(reviewable.map(item => [item.price.url, item.sourceTitle])) });
    for (const item of observations) {
      const index = reviewable.indexOf(item);
      const price = index < 0 ? item.price : reviewed[index].prices[0];
      const state = { price: price.price, original_price: price.originalPrice ?? null, stock: price.stock,
        installment_count: price.installment?.count ?? null, installment_amount: price.installment?.amount ?? null };
      const { data, error } = await supabase.rpc('persist_priority_offer', {
        p_product_id: item.target.productId, p_store_id: item.target.storeId, p_url: item.target.url,
        p_price: state.price, p_original_price: state.original_price, p_stock: state.stock,
        p_installment_count: state.installment_count, p_installment_amount: state.installment_amount,
        p_run_started_at: startedAt, p_observed_at: new Date(price.lastUpdated).toISOString(),
        p_review: price.identityReview ?? null, p_signature: buildPriceStateSignature(state),
      });
      const persisted = !error && data === true;
      results.push({ ...item.target, state: !persisted ? 'failed' : price.stock === 'out-of-stock' ? 'unavailable' : 'updated',
        observedAt: persisted ? new Date(price.lastUpdated).toISOString() : null,
        comparable: persisted && ['in-stock', 'low-stock'].includes(price.stock) && price.price > 0
          && isOfferFresh(price.lastUpdated) && !needsIdentityReview(price, item.product) });
    }
  }

  let guideAttempts = 0;
  for (let round = 0; round < 3 && !deadlineReached; round++) {
    const next = nextPriorityTargets(groups, attempted, results).slice(0, PRIORITY_MAX_GUIDE_OFFERS - guideAttempts);
    if (!next.length) break;
    for (let offset = 0; offset < next.length && !deadlineReached; offset += 8) await refreshBatch(next.slice(offset, offset + 8));
    guideAttempts += next.length;
  }
  let sampleRequested = 0;
  let sampleTruncated = false;
  if (includeSample && !deadlineReached) {
    const sampleProducts = [];
    for (const selected of sample.products) {
      const product = await readProductByIdFromDatabase(selected.id);
      if (!product || product.category !== selected.category) throw new Error('PRIORITY_SAMPLE_CHANGED');
      products.set(product.id, product); sampleProducts.push(product);
    }
    const candidates = planSampleTargets(sampleProducts).filter(target => !attempted.has(targetKey(target)));
    sampleRequested = candidates.length;
    sampleTruncated = candidates.length > PRIORITY_MAX_SAMPLE_OFFERS;
    for (let offset = 0; offset < Math.min(candidates.length, PRIORITY_MAX_SAMPLE_OFFERS) && !deadlineReached; offset += 8) {
      await refreshBatch(candidates.slice(offset, Math.min(offset + 8, PRIORITY_MAX_SAMPLE_OFFERS)));
    }
  }
  const missingGuideSlots = groups.filter(group => !group.covered && !results.some(result => result.comparable
    && group.targets.some(target => targetKey(target) === targetKey(result)))).map(group => group.key);
  return { source: 'priority-known-offers', startedAt, finishedAt: new Date().toISOString(), includeSample,
    attempted: attempted.size, observed: results.filter(result => result.observedAt).length,
    comparable: results.filter(result => result.comparable).length, missingGuideSlots, sampleRequested,
    sampleTruncated, deadlineReached, results };
}
