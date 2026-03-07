import type { Product } from '@/lib/types';

function toDateValue(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date(0);
}

export function hydrateProduct(product: Product): Product {
  return {
    ...product,
    createdAt: toDateValue(product.createdAt),
    updatedAt: toDateValue(product.updatedAt),
    lastScrapedAt: product.lastScrapedAt ? toDateValue(product.lastScrapedAt) : undefined,
    lastNormalizedAt: product.lastNormalizedAt ? toDateValue(product.lastNormalizedAt) : null,
    prices: (product.prices ?? []).map((price) => ({
      ...price,
      lastUpdated: toDateValue(price.lastUpdated),
    })),
  };
}

export function hydrateProducts(products: Product[]): Product[] {
  return products.map(hydrateProduct);
}

