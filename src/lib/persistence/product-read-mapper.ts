import { stores as staticStores } from '@/lib/scrapers/static-data';
import { computeComparableStorePriceStats } from '@/lib/price-utils';
import { sanitizeProduct } from '@/lib/product-sanitizer';
import type { Product } from '@/lib/types';
import { toDate, toNumber, toStockStatus } from '@/lib/persistence/product-read-helpers';
import type { DbProductRow } from '@/lib/persistence/product-read-types';

const storeNameById = new Map<string, string>(staticStores.map((store) => [store.id, store.name]));

export function mapDbProduct(row: DbProductRow): Product {
  const prices = (row.product_prices ?? []).map((price) => {
    const installmentCount = price.installment_count;
    const installmentAmount = toNumber(price.installment_amount, 0);

    return {
      storeId: price.store_id,
      storeName: storeNameById.get(price.store_id) ?? price.store_id,
      url: price.url,
      price: toNumber(price.price, 0),
      originalPrice: price.original_price === null ? undefined : toNumber(price.original_price, 0),
      stock: toStockStatus(price.stock),
      installment: installmentCount && installmentCount > 0
        ? {
            count: installmentCount,
            amount: installmentAmount,
            totalAmount: installmentAmount * installmentCount,
            interest: false,
          }
        : null,
      lastUpdated: toDate(price.last_updated),
    };
  });

  const comparableStats = computeComparableStorePriceStats(prices);
  const hasComparablePrices = comparableStats.comparablePrices.length > 0;

  const mapped: Product = {
    id: row.id,
    name: row.name,
    category: row.category as Product['category'],
    brand: row.brand || 'Generica',
    model: row.model || row.name,
    description: row.description ?? row.name,
    image: row.image ?? '/pixel-box.svg',
    normalizedTitle: row.normalized_title ?? row.name,
    canonicalProductKey: row.canonical_product_key ?? undefined,
    familyKey: row.family_key ?? undefined,
    variantKey: row.variant_key ?? undefined,
    refreshPriority: (row.refresh_priority as Product['refreshPriority']) ?? undefined,
    lastScrapedAt: row.last_scraped_at ? toDate(row.last_scraped_at) : undefined,
    lastNormalizedAt: row.last_normalized_at ? toDate(row.last_normalized_at) : null,
    specs: row.specs ?? {},
    prices: hasComparablePrices ? comparableStats.comparablePrices : prices,
    lowestPrice: hasComparablePrices
      ? comparableStats.lowest
      : toNumber(row.lowest_price, prices.length > 0 ? Math.min(...prices.map((price) => price.price)) : 0),
    highestPrice: hasComparablePrices
      ? comparableStats.highest
      : toNumber(row.highest_price, prices.length > 0 ? Math.max(...prices.map((price) => price.price)) : 0),
    averagePrice: toNumber(
      row.average_price,
      hasComparablePrices
        ? comparableStats.average
        : (prices.length > 0 ? prices.reduce((acc, current) => acc + current.price, 0) / prices.length : 0),
    ),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };

  return sanitizeProduct(mapped);
}
