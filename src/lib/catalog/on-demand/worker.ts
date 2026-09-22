import 'server-only';
import { getServerSupabaseServiceClient } from '@/lib/server/supabase-server';
import { readBuilderCatalog } from '@/lib/pc-builder/catalog';
import { getStoreScraper, FRAMEWORK_SCRAPERS } from '@/lib/scrapers/scraper-registry';
import { withAbortTimeout, withPromiseTimeout } from '@/lib/async/with-abort-timeout';
import { reviewProductOffers } from '@/lib/ai/review-product-offers';
import { buildPriceStateSignature } from '@/lib/persistence/product-write-dedupe';
import { hasExplicitIdentityConflict } from '@/lib/quality/offer-identity';
import { normalizeIdentityText, parseCpuModelSignature, parseGpuChipSignature } from '@/lib/product-identity';
import type { Product, ProductPrice } from '@/lib/types';
import type { RefreshItemResult, RefreshJob, RefreshTarget } from './contracts';

type ClaimedJob = RefreshJob & { lease_token: string };
function sameUrl(first: string, second: string): boolean {
  try { const a = new URL(first), b = new URL(second); a.hash = ''; b.hash = ''; return a.href === b.href; } catch { return false; }
}
async function fetchTarget(product: Product, target: RefreshTarget, startedAt: number): Promise<{ product: Product; price: ProductPrice; sourceTitle: string } | null> {
  const direct = getStoreScraper(target.storeId);
  const scrapers = direct ? [direct] : FRAMEWORK_SCRAPERS;
  const chip = product.category === 'procesadores' ? parseCpuModelSignature(product.name)
    : product.category === 'tarjetas-graficas' ? parseGpuChipSignature(product.name) : null;
  // Buscar por chip evita exigir a una tienda el título comercial de otra.
  // La aceptación sigue exigiendo coincidencia con la URL exacta seleccionada.
  const query = chip ? `${chip.family === 'unknown' ? '' : chip.family.replace('ryzen', 'ryzen ').replace('corei', 'core i')} ${chip.number}${chip.suffixes.join('')}`.trim()
    : product.name.slice(0, 120);
  // Los adaptadores de plataforma filtran por tienda antes de hacer solicitudes.
  // El límite se aplica a toda esta búsqueda, no se multiplica por plataforma.
  const batches = await Promise.all(scrapers.map((scraper) => withPromiseTimeout(withAbortTimeout((signal) => scraper.fn({ query,
      searchUrl: scraper.buildSearchUrl?.(query) ?? query, category: product.category,
      selectedStoreIds: new Set([target.storeId]), signal }), 25_000, 'requested-offer'), 26_000, 'requested-offer-hard-limit').catch(() => [])));
  for (const found of batches) {
    for (const source of found) {
      const price = source.prices.find((offer) => offer.storeId === target.storeId && sameUrl(offer.url, target.url));
      if (!price || !Number.isFinite(price.price) || price.price <= 0 || price.stock === 'unknown') continue;
      const observedAt = new Date(price.lastUpdated).getTime();
      if (!Number.isFinite(observedAt) || observedAt < startedAt || observedAt > Date.now() + 60_000) continue;
      // La URL exacta identifica la oferta. Un título contradictorio requiere revisión.
      const conflict = hasExplicitIdentityConflict({ name: product.name, category: product.category, offerText: source.name });
      const refreshed: ProductPrice = { ...price, url: target.url };
      if (conflict) refreshed.identityReview = { version: 1, status: 'needs-review', reason: 'explicit-conflict', reviewedAt: new Date().toISOString(), model: null, confidence: null,
        subject: { name: normalizeIdentityText(product.name), category: product.category, url: target.url } };
      return { product: { ...product, prices: [refreshed] }, price: refreshed, sourceTitle: source.name };
    }
  }
  return null;
}
export async function runRequestedRefresh(): Promise<{ processed: boolean; jobId?: string; status?: RefreshJob['status'] }> {
  const supabase = getServerSupabaseServiceClient();
  if (!supabase) throw new Error('REFRESH_UNAVAILABLE');
  const claimed = await supabase.rpc('claim_offer_refresh');
  if (claimed.error) throw new Error('REFRESH_CLAIM_FAILED');
  if (!claimed.data) return { processed: false };
  const job = claimed.data as ClaimedJob;
  const results: RefreshItemResult[] = [];
  const observed: { target: RefreshTarget; product: Product; price: ProductPrice; sourceTitle: string }[] = [];
  try {
    const products = await readBuilderCatalog({ ids: job.targets.map((target) => target.productId) });
    for (const target of job.targets) {
      const product = products.find((item) => item.id === target.productId);
      const fresh = product ? await fetchTarget(product, target, Date.parse(job.started_at ?? job.created_at)) : null;
      if (fresh) observed.push({ target, ...fresh });
      else results.push({ ...target, state: 'failed', observedAt: null });
    }
    const reviewable = observed.filter((item) => item.price.identityReview?.reason !== 'explicit-conflict');
    const reviewed = await reviewProductOffers(reviewable.map((item) => item.product), { authorizedRefresh: true,
      sourceTitles: Object.fromEntries(reviewable.map((item) => [item.price.url, item.sourceTitle])) });
    for (const item of observed) {
      const reviewIndex = reviewable.indexOf(item);
      const price = reviewIndex < 0 ? item.price : reviewed[reviewIndex].prices[0];
      const state = { price: price.price, original_price: price.originalPrice ?? null, stock: price.stock,
        installment_count: price.installment?.count ?? null, installment_amount: price.installment?.amount ?? null };
      const { data, error } = await supabase.rpc('persist_requested_offer', {
        p_job_id: job.id, p_lease_token: job.lease_token, p_product_id: item.target.productId, p_store_id: item.target.storeId, p_url: item.target.url,
        p_price: state.price, p_original_price: state.original_price, p_stock: state.stock, p_installment_count: state.installment_count, p_installment_amount: state.installment_amount,
        p_observed_at: new Date(price.lastUpdated).toISOString(), p_review: price.identityReview ?? null, p_signature: buildPriceStateSignature(state),
      });
      results.push({ ...item.target, state: error || data !== true ? 'failed' : price.stock === 'out-of-stock' ? 'unavailable' : 'updated', observedAt: error || data !== true ? null : new Date(price.lastUpdated).toISOString() });
    }
  } catch {
    for (const target of job.targets) if (!results.some((result) => result.productId === target.productId && result.storeId === target.storeId && result.url === target.url)) results.push({ ...target, state: 'failed', observedAt: null });
  }
  const failures = results.filter((result) => result.state === 'failed').length;
  const status = failures === results.length ? 'failed' : failures ? 'partial' : 'completed';
  const { data, error } = await supabase.from('requested_offer_refreshes').update({ status, results, finished_at: new Date().toISOString() })
    .eq('id', job.id).eq('lease_token', job.lease_token).eq('status', 'running').gt('expires_at', new Date().toISOString()).select('id');
  if (error || !data?.length) throw new Error('REFRESH_LEASE_EXPIRED');
  return { processed: true, jobId: job.id, status };
}
