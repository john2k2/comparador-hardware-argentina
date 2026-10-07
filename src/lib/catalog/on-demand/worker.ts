import 'server-only';
import { SourceHttpError, type SourceFailure } from '@/lib/scrapers/source-http';
import { fetchWooStoreKnownBatch, WOO_BATCH_STORES } from '@/lib/scrapers/woocommerce-known-batch';
import { isUnresolvedSourceTitle } from '@/lib/scrapers/source-title';
import { fetchKnownProductDetail } from '@/lib/scrapers/known-product-detail';
import { stores as configuredStores } from '@/lib/scrapers/static-data';
import { fetchCompraGamerCatalogProducts } from '@/lib/scrapers/compragamer';
import { sameListing, listingReference } from '@/lib/scrapers/listing-reference';
import { fetchWooCommerceKnownOffer, WOOCOMMERCE_STORES } from '@/lib/scrapers/woocommerce-shared';
import { getServerSupabaseServiceClient } from '@/lib/server/supabase-server';
import { readBuilderCatalog } from '@/lib/pc-builder/catalog';
import { getStoreScraper, FRAMEWORK_SCRAPERS } from '@/lib/scrapers/scraper-registry';
import { withAbortTimeout, withPromiseTimeout } from '@/lib/async/with-abort-timeout';
import { reviewProductOffers } from '@/lib/ai/review-product-offers';
import { buildPriceStateSignature } from '@/lib/persistence/product-write-dedupe';
import { bindReviewToSource, hasExplicitIdentityConflict, needsIdentityReview } from '@/lib/quality/offer-identity';
import { isOfferFresh } from '@/lib/price-freshness';
import { normalizeIdentityText, parseCpuModelSignature, parseGpuChipSignature } from '@/lib/product-identity';
import { inferHardwareCategoryFromName } from '@/lib/catalog/hardware-categories';
import { createRefreshClaimError } from '../refresh-diagnostics';
import type { Product, ProductPrice } from '@/lib/types';
import type { RefreshItemResult, RefreshJob, RefreshTarget } from './contracts';

type ClaimedJob = RefreshJob & { lease_token: string };
export type KnownOfferContext = { sources: Map<string, Promise<Product[][]>>; failures: Map<string, SourceFailure | 'no-observation'>; sharedReads: number; batchCatalog?: boolean; verifiedBatchStores: Set<string> };
export function createKnownOfferContext(batchCatalog = false): KnownOfferContext { return { batchCatalog, verifiedBatchStores:new Set(), sources: new Map(), failures: new Map(), sharedReads: 0 }; }
/** Agrupa destinos ya conocidos; no descubre productos ni cambia sus URLs. */
export async function prepareKnownOfferBatch(products: Map<string, Product>, targets: RefreshTarget[], context: KnownOfferContext): Promise<void> {
  for (const storeId of WOO_BATCH_STORES) {
    const selected=targets.filter(target=>target.storeId===storeId && products.has(target.productId));
    if (!selected.length) continue;
    const request=withAbortTimeout(signal=>fetchWooStoreKnownBatch(storeId,selected.map(target=>({url:target.url,category:products.get(target.productId)!.category})),signal,context.verifiedBatchStores),25000,'known-woo-batch');
    for (const target of selected) {
      const key=`${listingReference(storeId,target.url)}:${products.get(target.productId)!.category}`;
      context.sources.set(key,request.then(found=>[found]).catch((error: unknown)=>{
        context.failures.set(target.url,error instanceof SourceHttpError ? error.reason : 'invalid-response');
        return [];
      }));
    }
    // Cada fila consume la misma promesa; observar el rechazo evita uno sin dueño.
    await request.catch(()=>undefined);
  }
}
export async function fetchKnownOffer(product: Product, target: RefreshTarget, startedAt: number, context = createKnownOfferContext()): Promise<{ product: Product; price: ProductPrice; sourceTitle: string } | null> {
  if (!listingReference(target.storeId, target.url)) { context.failures.set(target.url, 'invalid-response'); return null; }
  const direct = getStoreScraper(target.storeId);
  const scrapers = direct ? [direct] : FRAMEWORK_SCRAPERS;
  const chip = product.category === 'procesadores' ? parseCpuModelSignature(product.name)
    : product.category === 'tarjetas-graficas' ? parseGpuChipSignature(product.name) : null;
  // Buscar por chip evita exigir a una tienda el título comercial de otra.
  // La aceptación sigue exigiendo coincidencia con la URL exacta seleccionada.
  // El ID de CompraGamer es estable aunque el catálogo agrupado conserve un
  // título anterior, con palabras que ya no figuran en la publicación.
  const compraGamerId = target.storeId === 'compragamer' ? listingReference(target.storeId,target.url)?.split(':').pop() : undefined;
  // El título agrupado de RAM puede traer RGB/CL/serie de otra publicación.
  // Buscar por atributos comunes permite recuperar la URL exacta y revisar
  // después esas diferencias, en vez de no encontrar nunca la publicación.
  const ramTerms = product.category === 'memoria-ram' ? [
    product.name.match(/\b(corsair|kingston|adata|crucial|gskill|patriot|lexar|mushkin|teamgroup|mancer)\b/i)?.[1],
    product.name.match(/\b(\d{1,3})\s*gb\b/i)?.[1]?.concat('gb'),
    product.name.match(/\bddr\s*([345])\b/i)?.[1]?.replace(/^/, 'ddr'),
  ] : [];
  const ramQuery = ramTerms.length === 3 && ramTerms.every(Boolean) ? ramTerms.join(' ') : undefined;
  const maximusCode = target.storeId === 'maximus' ? new URL(target.url).searchParams.get('PN')?.trim() : undefined;
  const query = compraGamerId ?? maximusCode ?? (chip ? `${chip.family === 'unknown' ? '' : chip.family.replace('ryzen', 'ryzen ').replace('corei', 'core i')} ${chip.number}${chip.suffixes.join('')}`.trim()
    : ramQuery ?? product.name.slice(0, 120));
  // Los adaptadores de plataforma filtran por tienda antes de hacer solicitudes.
  // El límite se aplica a toda esta búsqueda, no se multiplica por plataforma.
  // El detalle exige precio principal, disponibilidad explícita y URL exacta.
  const woo = WOOCOMMERCE_STORES.some(store => store.id === target.storeId);
  const key = `${listingReference(target.storeId, target.url)}:${product.category}`;
  const batchKey = target.storeId === 'compragamer' ? 'compragamer:catalog'
    : key;
  const existing = context.sources.get(key) ?? (context.batchCatalog ? context.sources.get(batchKey) : undefined);
  if (existing) context.sharedReads++;
  const request = existing ?? (async () => {
    if (context.batchCatalog && target.storeId === 'compragamer') return [await withAbortTimeout(signal => fetchCompraGamerCatalogProducts(signal), 25_000, 'known-cg')];
    if (woo) {
      const item = await withAbortTimeout(
        signal => fetchWooCommerceKnownOffer(target.storeId, target.url, product.category, signal),
        25_000, 'known-woo',
      );
      return [item ? [item] : []];
    }
    if (target.storeId !== 'compragamer') {
      const store = configuredStores.find(item => item.id === target.storeId);
      if (store) {
        const item = await withAbortTimeout(signal => fetchKnownProductDetail(target.url, { id:store.id,name:store.name,baseUrl:store.url },product.category,signal),25000,'known-detail').catch((error: unknown) => {
          if (error instanceof SourceHttpError && ['blocked','rate-limited','inconsistent-source'].includes(error.reason)) throw error;
          return null;
        });
        if (item) return [[item]];
      }
    }
    const searchKey = `${target.storeId}:search:${product.category}:${query}`;
    const sharedSearch = context.batchCatalog ? context.sources.get(searchKey) : undefined;
    if (sharedSearch) { context.sharedReads++; return sharedSearch; }
    const search = Promise.all(scrapers.map(scraper => withPromiseTimeout(
      withAbortTimeout(signal => scraper.fn({
        query, searchUrl: scraper.buildSearchUrl?.(query) ?? query,
        category: product.category, selectedStoreIds: new Set([target.storeId]), signal,
      }), 25_000, 'requested-offer'), 26_000, 'requested-offer-hard-limit',
    ).catch(() => [])));
    if (context.batchCatalog) context.sources.set(searchKey,search);
    return search;
  })();
  context.sources.set(key, request);
  if (context.batchCatalog) context.sources.set(batchKey, request);
  const batches = await request.catch((error: unknown) => {
    context.failures.set(target.url, error instanceof SourceHttpError ? error.reason : 'no-observation');
    return [];
  });
  for (const found of batches) {
    for (const source of found) {
      if (isUnresolvedSourceTitle(source.name)) continue;
      const price = source.prices.find((offer) => offer.storeId === target.storeId && sameListing(target.storeId, offer.url, target.url));
      if (!price || !Number.isFinite(price.price) || price.price <= 0 || (price.stock === 'unknown' && !context.batchCatalog)) continue;
      const observedAt = new Date(price.lastUpdated).getTime();
      if (!Number.isFinite(observedAt) || observedAt < startedAt || observedAt > Date.now() + 60_000) continue;
      // La URL o el ID estable de la tienda identifican la oferta. Un título contradictorio requiere revisión.
      const inferredCategory = inferHardwareCategoryFromName(source.name);
      const categoryConflict = context.batchCatalog && (source.category !== product.category
        || (inferredCategory !== undefined && inferredCategory !== product.category));
      const conflict = categoryConflict || hasExplicitIdentityConflict({ name: product.name, category: product.category, offerText: source.name });
      const previousReview = product.prices.find(offer => offer.storeId === target.storeId && sameListing(target.storeId, offer.url, target.url))?.identityReview;
      const sku = source.specs.SKU?.trim();
      const reference = listingReference(target.storeId, price.url);
      const sourceIdentity = reference ? { listingRef: reference, title: source.name.slice(0, 400),
        ...(source.specs.SourceListingId && /^[1-9]\d{0,14}$/.test(source.specs.SourceListingId) ? { sourceId: source.specs.SourceListingId } : {}),
        ...(sku && sku.length <= 160 && !/[\x00-\x1f]/.test(sku) ? { storeSku: sku } : {}) } : undefined;
      const refreshed: ProductPrice = { ...price, url: target.url,
        identityReview: bindReviewToSource(price.identityReview ?? previousReview, sourceIdentity, product, target.url), sourceIdentity };
      if (conflict) refreshed.identityReview = { version: 1, status: 'needs-review', reason: 'explicit-conflict', reviewedAt: new Date().toISOString(), model: null, confidence: null,
        sourceIdentity,
        subject: { name: normalizeIdentityText(product.name), category: product.category, url: target.url } };
      return { product: { ...product, prices: [refreshed] }, price: refreshed, sourceTitle: source.name };
    }
  }
  if (!context.failures.has(target.url)) context.failures.set(target.url, 'no-observation');
  return null;
}
type RequestedRefreshSummary = {
  processed: boolean;
  jobId?: string;
  status?: RefreshJob['status'];
  attempted?: number;
  observed?: number;
  comparable?: number;
  failures?: Record<string, number>;
};

export async function runRequestedRefresh(context = createKnownOfferContext()): Promise<RequestedRefreshSummary> {
  const supabase = getServerSupabaseServiceClient();
  if (!supabase) throw new Error('REFRESH_UNAVAILABLE');
  const claimStarted = Date.now();
  const claimContext = { rpc: 'claim_offer_refresh', phase: 'requested', batchIndex: 1, limit: 1 } as const;
  let claimed;
  try {
    claimed = await supabase.rpc('claim_offer_refresh');
  } catch (error) {
    throw createRefreshClaimError(error, claimContext, Date.now() - claimStarted);
  }
  if (claimed.error) throw createRefreshClaimError(claimed.error, claimContext, Date.now() - claimStarted);
  if (!claimed.data) return { processed: false };
  const job = claimed.data as ClaimedJob;
  const results: RefreshItemResult[] = [];
  const observed: { target: RefreshTarget; product: Product; price: ProductPrice; sourceTitle: string }[] = [];
  try {
    const products = await readBuilderCatalog({ ids: job.targets.map((target) => target.productId) });
    for (const target of job.targets) {
      const product = products.find((item) => item.id === target.productId);
      const fresh = product ? await fetchKnownOffer(product, target, Date.parse(job.started_at ?? job.created_at), context) : null;
      if (fresh) observed.push({ target, ...fresh });
      else results.push({ ...target, state: 'failed', observedAt: null,
        failureReason: product ? context.failures.get(target.url) ?? 'no-observation' : 'product-not-found' });
    }
    const reviewable = observed.filter((item) => item.price.identityReview?.reason !== 'explicit-conflict');
    const reviewed = await reviewProductOffers(reviewable.map((item) => item.product), { authorizedRefresh: true,
      sourceTitles: Object.fromEntries(reviewable.map((item) => [item.price.url, item.sourceTitle])) });
    for (const item of observed) {
      const reviewIndex = reviewable.indexOf(item);
      const price = reviewIndex < 0 ? item.price : reviewed[reviewIndex].prices[0];
      const state = { price: price.price, original_price: price.originalPrice ?? null, stock: price.stock,
        installment_count: price.installment?.count ?? null, installment_amount: price.installment?.amount ?? null };
      const { data, error } = await supabase.rpc('persist_verified_requested_offer', {
        p_job_id: job.id, p_lease_token: job.lease_token, p_product_id: item.target.productId, p_store_id: item.target.storeId, p_url: item.target.url,
        p_price: state.price, p_original_price: state.original_price, p_stock: state.stock, p_installment_count: state.installment_count, p_installment_amount: state.installment_amount,
        p_observed_at: new Date(price.lastUpdated).toISOString(), p_review: price.identityReview ?? null, p_signature: buildPriceStateSignature(state),
        p_source_identity: price.sourceIdentity ?? null, p_price_condition: price.priceCondition ?? (price.storeId === 'compragamer' ? 'special' : 'unspecified'),
      });
      const persisted = !error && data === true;
      const comparable = persisted && (price.stock === 'in-stock' || price.stock === 'low-stock')
        && Number.isFinite(price.price) && price.price > 0
        && isOfferFresh(price.lastUpdated) && !needsIdentityReview(price, item.product);
      results.push({ ...item.target, state: !persisted ? 'failed' : price.stock === 'out-of-stock' ? 'unavailable' : 'updated',
        observedAt: persisted ? new Date(price.lastUpdated).toISOString() : null, comparable, sourceIdentity: price.sourceIdentity,
        ...(!persisted ? { failureReason: 'persist-failed' } : {}) });
    }
  } catch {
    for (const target of job.targets) if (!results.some((result) => result.productId === target.productId && result.storeId === target.storeId && result.url === target.url)) results.push({ ...target, state: 'failed', observedAt: null, failureReason: 'processing-failed' });
  }
  const failures = results.filter((result) => result.state === 'failed').length;
  const status = failures === results.length ? 'failed' : failures ? 'partial' : 'completed';
  const { data, error } = await supabase.from('requested_offer_refreshes').update({ status, results, finished_at: new Date().toISOString() })
    .eq('id', job.id).eq('lease_token', job.lease_token).eq('status', 'running').gt('expires_at', new Date().toISOString()).select('id');
  if (error || !data?.length) throw new Error('REFRESH_LEASE_EXPIRED');
  const failureReasons: Record<string, number> = {};
  for (const result of results) {
    if (result.state !== 'failed') continue;
    const reason = result.failureReason ?? 'processing-failed';
    failureReasons[reason] = (failureReasons[reason] ?? 0) + 1;
  }
  // Sólo cuentan observaciones guardadas: leer la tienda no equivale a actualizar una oferta.
  return { processed: true, jobId: job.id, status, attempted: results.length,
    observed: results.filter(result => result.observedAt !== null).length,
    comparable: results.filter(result => result.comparable === true).length, failures: failureReasons };
}
