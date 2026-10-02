import { stores as staticStores } from '@/lib/scrapers/static-data';
import { computeComparableStorePriceStats, computeCurrentStorePriceStats } from '@/lib/price-utils';
import { sanitizeGuideProduct, sanitizeProduct } from '@/lib/product-sanitizer';
import { bindReviewToSource, buildIdentityEvidence, hasExplicitIdentityConflict, readIdentityReview, readSourceIdentity } from '@/lib/quality/offer-identity';
import { buildProductIdentityKey, extractExactModelIdentity, normalizeIdentityText } from '@/lib/product-identity';
import type { Product } from '@/lib/types';
import { toDate, toNumber, toStockStatus } from '@/lib/persistence/product-read-helpers';
import type { DbProductRow } from '@/lib/persistence/product-read-types';

const storeNameById = new Map<string, string>(staticStores.map((store) => [store.id, store.name]));

export function mapDbProduct(row: DbProductRow): Product {
  return mapProductRow(row, false);
}

export function mapDbGuideProduct(row: DbProductRow): Product {
  return mapProductRow(row, true);
}

function mapProductRow(row: DbProductRow, preserveOffers: boolean): Product {
  const category = row.category as Product['category'];
  const normalizedTitle = row.normalized_title ?? row.name;
  const staleKey = row.canonical_product_key?.includes('::')
    && !row.canonical_product_key.startsWith(`${category}::`);
  const exactModel = staleKey && (category === 'procesadores' || category === 'tarjetas-graficas')
    ? extractExactModelIdentity(category, normalizedTitle)
    : null;
  // Las claves antiguas usaban la categoría de la búsqueda. Solo corregimos
  // en lectura si el modelo de CPU/GPU es inequívoco; el ID público se conserva.
  // Las claves anteriores omitían variantes RAM (LPX/RS) y GPU (EVO/ICE/OC).
  // No se usan para agrupar fichas en lectura porque podrían unir SKUs distintos.
  const canonicalProductKey = ['memoria-ram', 'tarjetas-graficas'].includes(category)
    ? buildProductIdentityKey(category, row.name)
    : staleKey && exactModel
      ? buildProductIdentityKey(category, normalizedTitle, [row.brand, row.model, row.name].filter(Boolean).join(' '))
      : row.canonical_product_key ?? undefined;
  const prices = (row.product_prices ?? []).map((price) => {
    const installmentCount = price.installment_count;
    const installmentAmount = toNumber(price.installment_amount, 0);
    const storedReview = readIdentityReview(price.identity_review);
    const sourceIdentity = price.source_identity == null ? storedReview?.sourceIdentity : readSourceIdentity(price.source_identity);
    const boundReview = bindReviewToSource(storedReview, sourceIdentity, { name: row.name, category }, price.url);
    const evidence = ['memoria-ram', 'tarjetas-graficas', 'procesadores'].includes(category)
      ? buildIdentityEvidence(row.name, category, price.url, sourceIdentity?.title) : null;
    const explicitConflict = evidence && hasExplicitIdentityConflict(evidence);
    const invalidSource = price.source_identity != null && !sourceIdentity;

    return {
      storeId: price.store_id,
      storeName: storeNameById.get(price.store_id) ?? price.store_id,
      url: price.url,
      price: toNumber(price.price, 0),
      originalPrice: price.original_price === null ? undefined : toNumber(price.original_price, 0),
      stock: toStockStatus(price.stock),
      sourceIdentity,
      priceCondition: price.price_condition ?? undefined,
      installment: installmentCount && installmentCount > 0
        ? {
            count: installmentCount,
            amount: installmentAmount,
            totalAmount: installmentAmount * installmentCount,
            interest: false,
          }
        : null,
      // La falta de fecha no representa una observación de hoy.
      lastUpdated: price.last_updated && Number.isFinite(Date.parse(price.last_updated)) ? new Date(price.last_updated) : new Date(0),
      identityReview: explicitConflict || invalidSource ? {
        ...(sourceIdentity ? { sourceIdentity } : {}),
        version: 1 as const, status: 'needs-review' as const, reason: explicitConflict ? 'explicit-conflict' as const : 'invalid-response' as const,
        reviewedAt: null, model: null, confidence: null,
        subject: { name: normalizeIdentityText(row.name), category, url: price.url },
      } : boundReview,
    };
  });

  const comparableStats = computeComparableStorePriceStats(prices);
  const hasComparablePrices = comparableStats.comparablePrices.length > 0;
  const currentStats = computeCurrentStorePriceStats(prices, { name: row.name, category });
  const effectiveStats = currentStats.comparablePrices.length ? currentStats : comparableStats;

  const mapped: Product = {
    id: row.id,
    name: row.name,
    // La categoria persistida es la fuente de verdad para que filtro, conteo y
    // paginacion operen sobre el mismo conjunto de filas.
    category,
    brand: row.brand || 'Generica',
    model: row.model || row.name,
    description: row.description ?? row.name,
    image: row.image ?? '/pixel-box.svg',
    normalizedTitle,
    canonicalProductKey,
    familyKey: row.family_key ?? undefined,
    variantKey: row.variant_key ?? undefined,
    refreshPriority: (row.refresh_priority as Product['refreshPriority']) ?? undefined,
    lastScrapedAt: row.last_scraped_at ? toDate(row.last_scraped_at) : undefined,
    lastNormalizedAt: row.last_normalized_at ? toDate(row.last_normalized_at) : null,
    specs: row.specs ?? {},
    // Conservar ofertas pendientes/históricas para revisar su identidad y elegir alternativas.
    prices,
    lowestPrice: hasComparablePrices
      ? effectiveStats.lowest
      : toNumber(row.lowest_price, prices.length > 0 ? Math.min(...prices.map((price) => price.price)) : 0),
    highestPrice: hasComparablePrices
      ? effectiveStats.highest
      : toNumber(row.highest_price, prices.length > 0 ? Math.max(...prices.map((price) => price.price)) : 0),
    averagePrice: hasComparablePrices ? effectiveStats.average : toNumber(row.average_price, 0),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };

  return preserveOffers ? sanitizeGuideProduct(mapped) : sanitizeProduct(mapped);
}
