import { normalizeDisplayText } from '@/lib/text-utils';
import type { Product, ProductPrice } from '@/lib/types';

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

function sanitizePrice(price: ProductPrice): ProductPrice {
  return {
    ...price,
    storeName: sanitizeText(price.storeName, price.storeId),
    url: (price.url ?? '').trim(),
  };
}

export function sanitizeProduct(product: Product): Product {
  const name = sanitizeText(product.name);
  const fallbackName = name || product.name.trim();

  return {
    ...product,
    name: fallbackName,
    brand: sanitizeText(product.brand, 'Generica'),
    model: sanitizeText(product.model, fallbackName),
    description: sanitizeText(product.description, fallbackName),
    specs: sanitizeSpecs(product.specs),
    prices: (product.prices ?? []).map(sanitizePrice),
  };
}

export function sanitizeProducts(products: Product[]): Product[] {
  return products.map(sanitizeProduct);
}
