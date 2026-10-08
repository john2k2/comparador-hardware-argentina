import 'server-only';
import { randomUUID } from 'node:crypto';
import { getServerSupabaseServiceClient } from '@/lib/server/supabase-server';
import { fetchWooCommerceKnownOffer } from '@/lib/scrapers/woocommerce-shared';
import { listingReference, sameListing } from '@/lib/scrapers/listing-reference';
import { resolveHardwareCategoryForProduct } from './hardware-categories';
import { hasExplicitIdentityConflict } from '@/lib/quality/offer-identity';
import { persistProductsSnapshot } from '@/lib/persistence/product-catalog';
import type { Product } from '@/lib/types';
type DetailTarget = { store_id: string; source_id: string; url: string; title: string };

export function acceptInventoryDetail(target: DetailTarget, product: Product | null, started: number): Product | null {
  if (!product || target.store_id !== 'katech' || !/^\d+$/.test(target.source_id)) return null;
  const price = product.prices[0], observedAt = new Date(price?.lastUpdated).getTime();
  if (!price || price.storeId !== target.store_id || !sameListing(target.store_id, target.url, price.url)
    || !Number.isFinite(price.price) || price.price <= 0 || !Number.isFinite(observedAt) || observedAt < started || observedAt > Date.now() + 60000
    || hasExplicitIdentityConflict({ name: target.title, category: resolveHardwareCategoryForProduct(target.title), offerText: product.name })) return null;
  const reference = listingReference(target.store_id, target.url);
  if (!reference) return null;
  return { ...product, id: `${target.store_id}-api-${target.source_id}`, specs: { ...product.specs, SourceListingId: target.source_id },
    prices: [{ ...price, url: target.url, priceCondition: 'unspecified', sourceIdentity: { listingRef: reference, sourceId: target.source_id, title: product.name.slice(0, 400),
      ...(product.specs.SKU ? { storeSku: product.specs.SKU } : {}) } }] };
}

export const INVENTORY_DETAIL_MAX_MS = 3 * 60000;
export async function runInventoryDetailDiscovery(options: { maxRunMs?: number } = {}) {
  if (process.env.CATALOG_REQUESTED_RUNNER !== '1') throw new Error('REFRESH_RUNNER_REQUIRED');
  const client = getServerSupabaseServiceClient();
  if (!client) throw new Error('REFRESH_DATABASE_UNAVAILABLE');
  const token = randomUUID(), started = Date.now(), signal = AbortSignal.timeout(Math.max(1, Math.min(INVENTORY_DETAIL_MAX_MS, options.maxRunMs ?? INVENTORY_DETAIL_MAX_MS)));
  const claimed = await client.rpc('claim_catalog_inventory_details', { p_token: token, p_limit: 48 });
  if (claimed.error) return { status: 'failed', code: 'REFRESH_DETAIL_CLAIM_FAILED', attempted: 0, imported: 0 };
  let attempted = 0, imported = 0, failures = 0;
  try {
    for (const target of claimed.data as DetailTarget[]) {
      if (signal.aborted) return { status: 'deadline', attempted, imported, failures };
      let saved: Product | null = null;
      try {
        const detail = await fetchWooCommerceKnownOffer(target.store_id, target.url, resolveHardwareCategoryForProduct(target.title), signal);
        const accepted = acceptInventoryDetail(target, detail, started);
        if (accepted) { await persistProductsSnapshot([accepted], { requirePersistence: true }); saved = accepted; }
      } catch { /* Una ficha fallida conserva presencia; no fabrica precio ni stock. */ }
      const complete = () => client.rpc('finish_catalog_inventory_detail', { p_store_id: target.store_id, p_source_id: target.source_id, p_token: token, p_product_id: saved?.id ?? null });
      let finished = await complete();
      for (let retry = 0; finished.error && retry < 2; retry++) {
        await new Promise(resolve => setTimeout(resolve, 300 * (retry + 1))); finished = await complete();
      }
      if (finished.error || finished.data !== true) throw new Error('REFRESH_DETAIL_FINISH_FAILED');
      attempted++; if (saved) imported++; else failures++;
    }
    return { status: 'completed', attempted, imported, failures };
  } catch {
    return { status: 'failed', code: 'REFRESH_DETAIL_INTERRUPTED', attempted, imported, failures };
  } finally {
    const released = await client.from('catalog_inventory_listings').update({ detail_lease_token: null, detail_leased_until: null }).eq('detail_lease_token', token);
    if (released.error) throw new Error('REFRESH_DETAIL_RELEASE_FAILED');
  }
}
