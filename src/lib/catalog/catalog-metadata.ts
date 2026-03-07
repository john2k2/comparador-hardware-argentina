import type { Product, RefreshPriority } from '@/lib/types';
import { normalizeProductTitlesWithStats } from '@/lib/ai/normalize-products';
import {
  buildProductFamilyKey,
  buildProductIdentityKey,
  buildProductVariantKey,
} from '@/lib/product-identity';
import { sanitizeProduct } from '@/lib/product-sanitizer';

export type CatalogNormalizedProduct = Product & {
  normalizedTitle: string;
  canonicalProductKey: string;
  familyKey?: string;
  variantKey: string;
  refreshPriority: RefreshPriority;
  lastScrapedAt: Date;
  lastNormalizedAt: Date;
};

function resolveRefreshPriority(product: Product, trackedProductIds: Set<string>): RefreshPriority {
  if (trackedProductIds.has(product.id)) return 'tracked';

  const prices = product.prices ?? [];
  const hasStock = prices.some((price) => price.stock === 'in-stock' || price.stock === 'low-stock');
  if (!hasStock) return 'cold';
  if (prices.length >= 3) return 'hot';
  return 'normal';
}

export async function buildCatalogMetadata(
  products: Product[],
  trackedProductIds: Set<string>,
): Promise<CatalogNormalizedProduct[]> {
  if (products.length === 0) return [];

  const sanitizedProducts = products.map(sanitizeProduct);
  const uniqueTitles = Array.from(new Set(sanitizedProducts.map((product) => product.name)));
  const normalization = await normalizeProductTitlesWithStats(uniqueTitles, {
    useDatabaseCache: true,
  });
  const now = new Date();

  return sanitizedProducts.map((product) => {
    const normalizedTitle = normalization.map.get(product.name) ?? product.name;
    const identityFallback = [product.brand, product.model, product.name]
      .map((value) => value?.trim())
      .filter(Boolean)
      .join(' ');

    return {
      ...product,
      normalizedTitle,
      canonicalProductKey: buildProductIdentityKey(product.category, normalizedTitle, identityFallback),
      familyKey: buildProductFamilyKey(product.category, normalizedTitle, identityFallback) ?? undefined,
      variantKey: buildProductVariantKey(product.category, normalizedTitle, identityFallback),
      refreshPriority: resolveRefreshPriority(product, trackedProductIds),
      lastScrapedAt: product.updatedAt instanceof Date ? product.updatedAt : now,
      lastNormalizedAt: now,
    };
  });
}
