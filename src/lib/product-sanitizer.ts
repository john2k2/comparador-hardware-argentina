import { computeComparableStorePriceStats, computeCurrentStorePriceStats } from '@/lib/price-utils';
import { normalizeDisplayText } from '@/lib/text-utils';
import { normalizeProductImageUrl } from '@/lib/product-images';
import type { Product, ProductPrice } from '@/lib/types';
import { needsIdentityReview } from '@/lib/quality/offer-identity';

function sanitizeText(value: string | null | undefined, fallback = ''): string {
  const normalized = normalizeDisplayText(value);
  return normalized || fallback;
}

function sanitizeSpecs(specs: Record<string, string> | null | undefined): Record<string, string> {
  if (!specs) return {};

  const entries = Object.entries(specs)
    .map(([key, value]) => {
      const normalizedKey = sanitizeText(key);
      const normalizedValue = sanitizeText(value);
      return [normalizedKey, normalizedValue] as const;
    })
    .filter(([key, value]) => key.length > 0 && value.length > 0);

  return Object.fromEntries(entries);
}

function sanitizePrice(price: ProductPrice): ProductPrice | null {
  if (!price.storeId || !Number.isFinite(price.price) || price.price <= 0) {
    return null;
  }

  return {
    ...price,
    storeName: sanitizeText(price.storeName, price.storeId),
    url: (price.url ?? '').trim(),
    // Conservar el importe observado; el formato visual decide los decimales.
    price: price.price,
  };
}

export function sanitizeProduct(product: Product): Product {
  return sanitizeProductOffers(product, false);
}

/** Conserva publicaciones alternativas hasta evaluar la elegibilidad de la guía. */
export function sanitizeGuideProduct(product: Product): Product {
  return sanitizeProductOffers(product, true);
}

function sanitizeProductOffers(product: Product, preserveOffers: boolean): Product {
  const name = sanitizeText(product.name);
  const fallbackName = name || product.name.trim();
  const specs = sanitizeSpecs(product.specs);
  const subject = { name: fallbackName, category: product.category, specs };
  const sanitizedPrices = (product.prices ?? [])
    .map(sanitizePrice)
    .filter((price): price is ProductPrice => Boolean(price))
    .map(price => price.identityReview?.proof?.method === 'manufacturer-ram' && needsIdentityReview(price, product)
      ? { ...price, identityReview: { ...price.identityReview, status: 'needs-review' as const } }
      : price);
  const comparableStats = sanitizedPrices.length > 0
    ? computeComparableStorePriceStats(sanitizedPrices, subject)
    : null;
  const currentStats = computeCurrentStorePriceStats(sanitizedPrices, subject);
  const effectiveStats = currentStats.comparablePrices.length ? currentStats : comparableStats;

  return {
    ...product,
    name: fallbackName,
    brand: sanitizeText(product.brand, 'Generica'),
    model: sanitizeText(product.model, fallbackName),
    description: sanitizeText(product.description, fallbackName),
    image: normalizeProductImageUrl(product.image),
    specs,
    // Una alternativa actual puede quedar detrás del mínimo histórico de la tienda.
    prices: preserveOffers || currentStats.comparablePrices.length || !comparableStats?.comparablePrices.length
      ? sanitizedPrices : comparableStats.comparablePrices,
    lowestPrice: effectiveStats?.lowest ?? product.lowestPrice,
    highestPrice: effectiveStats?.highest ?? product.highestPrice,
    averagePrice: effectiveStats?.average ?? product.averagePrice,
  };
}

export function sanitizeProducts(products: Product[]): Product[] {
  return products.map(sanitizeProduct);
}
