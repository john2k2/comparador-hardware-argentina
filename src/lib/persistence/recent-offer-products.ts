import { getD1CatalogReader } from '@/lib/catalog/catalog-backend';
import 'server-only';
import { getServerSupabaseReadClient } from '@/lib/server/supabase-server';
import { inferHardwareCategoryFromName } from '@/lib/catalog/hardware-categories';
import { OFFER_FRESH_MS, isOfferFresh } from '@/lib/price-freshness';
import { computeComparableStorePriceStats, isComparableStoreOffer } from '@/lib/price-utils';
import { logger } from '@/lib/logger';
import type { HardwareCategory, Product } from '@/lib/types';
import { PRODUCT_SELECT_FIELDS } from './product-read-helpers';
import { mapDbGuideProduct } from './product-read-mapper';
import type { DbProductRow } from './product-read-types';

const OFFER_CANDIDATE_LIMIT = 160;
const PRODUCT_CANDIDATE_LIMIT = 64;
const READ_BUDGET_MS = 7_000;
type RecentOfferSeed = { product_id: string; product: { id: string; name: string; category: string } };
export type CatalogSelectionCoverage = {
  source: 'supabase' | 'catalog-reader' | 'fixture' | 'query';
  receivedOffers: number | null; receivedProducts: number; eligibleProducts: number;
  offerLimit: number | null; productLimit: number | null; truncated: boolean | null;
  observedAt: string;
};

/** Lee primero observaciones de precios, no modificaciones de fichas. La ventana
 * está acotada: encontrar candidatas no acredita cobertura de todo el catálogo. */
export async function readRecentOfferProducts(input: { category?: HardwareCategory } = {}): Promise<Product[]> {
  return (await readRecentOfferProductSelection(input)).products;
}
export async function readRecentOfferProductSelection(input: { category?: HardwareCategory } = {}): Promise<{
  products: Product[]; coverage: CatalogSelectionCoverage;
}> {
  const sql = await getD1CatalogReader();
  if (sql) {
    const products = await sql.readRecentProducts(input.category);
    return { products, coverage: { source: 'catalog-reader', receivedOffers: null, receivedProducts: products.length,
      eligibleProducts: products.length, offerLimit: null, productLimit: null, truncated: null, observedAt: new Date().toISOString() } };
  }
  const client = getServerSupabaseReadClient();
  if (!client) throw new Error('RECENT_CATALOG_UNAVAILABLE');
  const now = Date.now();
  const signal = AbortSignal.timeout(READ_BUDGET_MS);
  let seeds = client.from('product_prices')
    .select('product_id,product:products!inner(id,name,category)')
    .in('stock', ['in-stock', 'low-stock']).gt('price', 0)
    .gte('last_updated', new Date(now - OFFER_FRESH_MS).toISOString())
    .lte('last_updated', new Date(now + 60_000).toISOString());
  if (input.category) seeds = seeds.eq('product.category', input.category);
  const { data, error } = await seeds.order('last_updated', { ascending: false })
    .order('product_id', { ascending: true }).order('id', { ascending: true })
    .limit(OFFER_CANDIDATE_LIMIT).abortSignal(signal);
  if (error || !Array.isArray(data)) throw new Error('RECENT_CATALOG_UNAVAILABLE');

  const allIds = new Set<string>();
  for (const seed of data as unknown as RecentOfferSeed[]) {
    if (!seed || typeof seed.product_id !== 'string' || !seed.product
      || seed.product.id !== seed.product_id || typeof seed.product.name !== 'string') {
      throw new Error('RECENT_CATALOG_INVALID_RESPONSE');
    }
    // No permitir que accesorios mal categorizados consuman la ventana de piezas.
    if (inferHardwareCategoryFromName(seed.product.name) !== seed.product.category
      || (input.category && seed.product.category !== input.category)) continue;
    allIds.add(seed.product_id);
  }
  const ids = new Set([...allIds].slice(0, PRODUCT_CANDIDATE_LIMIT));
  const coverage: CatalogSelectionCoverage = { source: 'supabase', receivedOffers: data.length,
    receivedProducts: 0, eligibleProducts: 0, offerLimit: OFFER_CANDIDATE_LIMIT, productLimit: PRODUCT_CANDIDATE_LIMIT,
    // Alcanzar un LIMIT no prueba que exista otra fila. Más de64 IDs sí prueba recorte.
    truncated: allIds.size > PRODUCT_CANDIDATE_LIMIT ? true : data.length === OFFER_CANDIDATE_LIMIT ? null : false,
    observedAt: new Date(now).toISOString() };
  if (data.length === OFFER_CANDIDATE_LIMIT || ids.size === PRODUCT_CANDIDATE_LIMIT) {
    logger.info('Selección reciente limitada a su ventana de lectura', {
      category: input.category ?? 'all', offerCandidates: data.length, productCandidates: ids.size,
    });
  }
  if (!ids.size) return { products: [], coverage };

  const { data: rows, error: productError } = await client.from('products')
    .select(PRODUCT_SELECT_FIELDS).in('id', [...ids]).limit(PRODUCT_CANDIDATE_LIMIT).abortSignal(signal);
  if (productError || !Array.isArray(rows)) throw new Error('RECENT_CATALOG_UNAVAILABLE');
  const checkedAt = Date.now();
  const products = (rows as DbProductRow[]).flatMap((row) => {
    if (!row || !ids.has(row.id) || !Array.isArray(row.product_prices)) throw new Error('RECENT_CATALOG_INVALID_RESPONSE');
    // Mantener publicaciones alternativas y dictámenes ligados a su nombre original.
    const product = mapDbGuideProduct(row);
    if (inferHardwareCategoryFromName(product.name) !== product.category
      || (input.category && product.category !== input.category)) return [];
    const prices = product.prices.filter(offer => Boolean(offer.storeId && offer.url) && isOfferFresh(offer.lastUpdated, checkedAt)
      && isComparableStoreOffer(offer, product));
    const stats = computeComparableStorePriceStats(prices, product);
    if (!stats.comparablePrices.length) return [];
    return [{ ...product, prices, lowestPrice: stats.lowest, highestPrice: stats.highest, averagePrice: stats.average }];
  }).sort((a, b) => newestObservation(b) - newestObservation(a)
    || a.lowestPrice - b.lowestPrice || a.id.localeCompare(b.id));
  return { products, coverage: { ...coverage, receivedProducts: rows.length, eligibleProducts: products.length } };
}

function newestObservation(product: Product): number {
  return Math.max(...product.prices.map(offer => new Date(offer.lastUpdated).getTime()));
}
