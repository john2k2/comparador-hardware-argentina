import 'server-only';
import { randomUUID } from 'node:crypto';
import { getServerSupabaseServiceClient } from '@/lib/server/supabase-server';
import { fetchSourceInventory } from '@/lib/scrapers/source-inventory';
import { listingReference } from '@/lib/scrapers/listing-reference';
import { SourceHttpError } from '@/lib/scrapers/source-http';
import { persistProductsSnapshot } from '@/lib/persistence/product-catalog';
import type { Product } from '@/lib/types';

type SavedListing = { url: string; product_id: string };
type RegistryListing = { source_id: string; url: string; product_id: string | null };

export function planInventoryDiscovery(storeId: string, products: Product[], saved: SavedListing[], registry: RegistryListing[]) {
  const represented = new Set(saved.map(item => listingReference(storeId, item.url)));
  const previous = new Map(registry.map(item => [item.source_id, item]));
  const newProducts: Product[] = [];
  let migratedUrls = 0;
  for (const product of products) {
    const price = product.prices[0], sourceId = product.specs.SourceListingId ?? listingReference(storeId, price.url)?.split(':').pop();
    if (!sourceId) continue;
    if (represented.has(listingReference(storeId, price.url))) continue;
    const prior = previous.get(sourceId);
    // Un ID estable con URL nueva requiere reconciliación; no fabricar un duplicado.
    if (prior && listingReference(storeId, prior.url) !== listingReference(storeId, price.url)) { migratedUrls++; continue; }
    if (prior?.product_id) continue;
    const reference = listingReference(storeId, price.url);
    if (!reference) continue;
    product.prices[0] = { ...price, sourceIdentity: { listingRef: reference, title: product.name.slice(0, 400),
      ...(product.specs.SKU ? { storeSku: product.specs.SKU } : {}) } };
    newProducts.push(product);
  }
  return { newProducts, migratedUrls };
}

export async function runInventoryDiscovery() {
  if (process.env.CATALOG_REQUESTED_RUNNER !== '1') throw new Error('REFRESH_RUNNER_REQUIRED');
  const client = getServerSupabaseServiceClient();
  if (!client) throw new Error('REFRESH_DATABASE_UNAVAILABLE');
  const signal = AbortSignal.timeout(7 * 60_000);
  return Promise.all(['compragamer', 'maxtecno', 'katech'].map(async storeId => {
    const token = randomUUID(), startedAt = new Date().toISOString();
    const claimed = await client.rpc('claim_catalog_inventory', { p_store_id: storeId, p_token: token });
    if (claimed.error) return { storeId, status: 'failed', code: 'REFRESH_INVENTORY_CLAIM_FAILED' };
    if (claimed.data !== true) return { storeId, status: 'deferred' };
    let summary: Record<string, unknown> = { storeId, status: 'failed', startedAt };
    let success = false;
    try {
      const inventory = await fetchSourceInventory(storeId, signal);
      const saved: SavedListing[] = [], registry: RegistryListing[] = [];
      for (let offset = 0; ; offset += 1000) {
        signal.throwIfAborted();
        const response = await client.from('product_prices').select('url,product_id').eq('store_id', storeId).order('id').range(offset, offset + 999);
        if (response.error) throw new Error('REFRESH_INVENTORY_READ_FAILED');
        saved.push(...response.data);
        if (response.data.length < 1000) break;
      }
      for (let offset = 0; ; offset += 1000) {
        const response = await client.from('catalog_inventory_listings').select('source_id,url,product_id').eq('store_id', storeId).order('source_id').range(offset, offset + 999);
        if (response.error) throw new Error('REFRESH_INVENTORY_READ_FAILED');
        registry.push(...response.data);
        if (response.data.length < 1000) break;
      }
      const products = inventory.listings.flatMap(item => item.product ? [item.product] : []);
      const plan = planInventoryDiscovery(storeId, products, saved, registry);
      let imported = 0;
      for (let offset = 0; offset < plan.newProducts.length; offset += 100) {
        signal.throwIfAborted();
        const batch = plan.newProducts.slice(offset, offset + 100);
        // Sólo altas: no renombrar productos agrupados ni podar sus otras ofertas.
        await persistProductsSnapshot(batch, { requirePersistence: true });
        imported += batch.length;
        summary = { ...summary, imported };
      }
      const links = new Map<string | null, Set<string>>();
      for (const item of saved) {
        const reference = listingReference(storeId, item.url);
        const ids = links.get(reference) ?? new Set<string>(); ids.add(item.product_id); links.set(reference, ids);
      }
      for (const product of plan.newProducts) links.set(listingReference(storeId, product.prices[0].url), new Set([product.id]));
      const seenAt = new Date().toISOString();
      for (let offset = 0; offset < inventory.listings.length; offset += 250) {
        signal.throwIfAborted();
        const registered = await client.rpc('register_catalog_inventory', { p_store_id: storeId, p_token: token,
          p_entries: inventory.listings.slice(offset, offset + 250).map(item => {
            const ids = links.get(listingReference(storeId, item.url));
            return { source_id: item.sourceId, url: item.url, title: item.title,
              product_id: ids?.size === 1 ? [...ids][0] : null, last_seen_at: seenAt };
          }) });
        if (registered.error || registered.data !== true) throw new Error('REFRESH_INVENTORY_REGISTER_FAILED');
      }
      const refs = new Set(inventory.listings.map(item => listingReference(storeId, item.url)));
      summary = { storeId, status: 'completed', startedAt, finishedAt: new Date().toISOString(),
        publishedListings: inventory.listings.length, pages: inventory.pages, rejectedProducts: inventory.rejectedProducts,
        imported, migratedUrls: plan.migratedUrls, historicalOffersAbsent: saved.filter(item => !refs.has(listingReference(storeId, item.url))).length };
      success = true;
    } catch (error) {
      const code = error instanceof SourceHttpError ? error.reason : error instanceof Error && /^REFRESH_[A-Z_]+$/.test(error.message) ? error.message : 'REFRESH_INVENTORY_FAILED';
      summary = { ...summary, code, finishedAt: new Date().toISOString() };
    }
    const complete = () => client.rpc('finish_catalog_inventory', { p_store_id: storeId, p_token: token, p_success: success, p_summary: summary });
    let finished = await complete();
    for (let retry = 0; finished.error && retry < 2; retry++) {
      await new Promise(resolve => setTimeout(resolve, 300 * (retry + 1))); finished = await complete();
    }
    if (finished.error || finished.data !== true) return { ...summary, status: 'failed', code: 'REFRESH_INVENTORY_FINISH_FAILED' };
    return summary;
  }));
}
