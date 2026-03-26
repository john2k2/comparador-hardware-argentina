import { computeComparableStorePriceStats } from '@/lib/price-utils';
import { buildProductIdentityKey, extractExactModelIdentity, normalizeIdentityText } from '@/lib/product-identity';
import type { Product } from '@/lib/types';
import type { ProductSort } from '@/lib/persistence/product-read-types';

const DEDUPE_STOPWORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'y', 'con', 'para', 'por',
  'vga', 'placa', 'video', 'procesador', 'micro', 'cpu', 'gpu', 'gamer',
]);

export function applyTextFilter(products: Product[], query: string): Product[] {
  const normalizedQuery = normalizeIdentityText(query);
  const words = normalizedQuery
    .split(/\s+/)
    .filter((word) => word.length > 1);

  if (words.length === 0) return products;

  return products.filter((product) => {
    const searchable = [
      product.name,
      product.brand,
      product.model,
      product.normalizedTitle ?? '',
      product.familyKey ?? '',
      product.variantKey ?? '',
      product.canonicalProductKey ?? '',
    ]
      .map((value) => normalizeIdentityText(value))
      .join(' ');
    return words.some((word) => searchable.includes(word));
  });
}

function normalizeGroupName(value: string): string {
  return normalizeIdentityText(value).replace(/\+/g, ' ');
}

function buildIdentityFallback(product: Product): string {
  return [product.brand, product.model, product.name]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(' ');
}

function tokenizeNameForDedupe(value: string): string[] {
  return normalizeGroupName(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 1)
    .filter((token) => !DEDUPE_STOPWORDS.has(token));
}

function extractProductFingerprint(name: string): { brand: string | null; chip: string | null; memory: string | null } {
  const normalized = normalizeGroupName(name);
  const brand = (normalized.match(/\b(asus|gigabyte|msi|zotac|palit|inno3d|asrock|pny|xfx|sapphire|amd|intel)\b/) ?? [])[1] ?? null;
  const chip = (normalized.match(/\b(rtx\s*\d{3,4}(?:\s*(?:ti|super))?|rx\s*\d{3,4}(?:\s*xt)?|ryzen\s*[3579]\s*\d{3,5}(?:x3d|gt|ge|xt|x|g|f)?|core\s*i[3579]\s*\d{4,5}[a-z]{0,2})\b/) ?? [])[1]?.replace(/\s+/g, '') ?? null;
  const memory = (normalized.match(/\b(\d{1,2}\s*gb)\b/) ?? [])[1]?.replace(/\s+/g, '') ?? null;
  return { brand, chip, memory };
}

function hasSameStoreAndPrice(first: Product, second: Product): boolean {
  for (const firstPrice of first.prices) {
    for (const secondPrice of second.prices) {
      if (firstPrice.storeId === secondPrice.storeId && firstPrice.price === secondPrice.price) {
        return true;
      }
    }
  }
  return false;
}

function isSubsetTokens(first: Set<string>, second: Set<string>): boolean {
  if (first.size === 0 || second.size === 0) return false;
  if (first.size > second.size) return false;
  for (const token of first) {
    if (!second.has(token)) return false;
  }
  return true;
}

function canFuzzyMerge(existing: Product, candidate: Product): boolean {
  if (existing.category !== candidate.category) return false;

  const existingExactModel = extractExactModelIdentity(existing.category, existing.name);
  const candidateExactModel = extractExactModelIdentity(candidate.category, candidate.name);
  if (existingExactModel && candidateExactModel && existingExactModel === candidateExactModel) {
    return true;
  }

  const existingFingerprint = extractProductFingerprint(existing.name);
  const candidateFingerprint = extractProductFingerprint(candidate.name);

  if (!hasSameStoreAndPrice(existing, candidate)) return false;
  if (!existingFingerprint.chip || !candidateFingerprint.chip) return false;
  if (existingFingerprint.chip !== candidateFingerprint.chip) return false;
  if (existingFingerprint.brand && candidateFingerprint.brand && existingFingerprint.brand !== candidateFingerprint.brand) return false;
  if (existingFingerprint.memory && candidateFingerprint.memory && existingFingerprint.memory !== candidateFingerprint.memory) return false;

  const existingTokens = new Set(tokenizeNameForDedupe(existing.name));
  const candidateTokens = new Set(tokenizeNameForDedupe(candidate.name));
  return isSubsetTokens(existingTokens, candidateTokens) || isSubsetTokens(candidateTokens, existingTokens);
}

function mergeGroupedPrices(current: Product['prices'], incoming: Product['prices']): Product['prices'] {
  const merged = [...current];

  for (const candidate of incoming) {
    const existingIndex = merged.findIndex((price) => price.storeId === candidate.storeId);
    if (existingIndex < 0) {
      merged.push(candidate);
      continue;
    }

    const existing = merged[existingIndex];
    const candidateUpdatedMs = candidate.lastUpdated.getTime();
    const existingUpdatedMs = existing.lastUpdated.getTime();
    const isNewer = candidateUpdatedMs > existingUpdatedMs;
    const isCheaper = candidate.price < existing.price;
    const recoversStock = existing.stock === 'out-of-stock' && candidate.stock !== 'out-of-stock';

    if (isNewer || isCheaper || recoversStock) {
      merged[existingIndex] = candidate;
    }
  }

  return merged;
}

export function dedupeProductsByCanonicalName(products: Product[]): Product[] {
  if (products.length <= 1) return products;

  const grouped = new Map<string, Product>();

  for (const product of products) {
    const normalizedName = normalizeGroupName(product.name);
    if (!normalizedName) continue;

    const key = product.canonicalProductKey
      ?? buildProductIdentityKey(product.category, normalizedName, buildIdentityFallback(product));
    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, {
        ...product,
        prices: [...product.prices],
      });
      continue;
    }

    const mergedPrices = mergeGroupedPrices(existing.prices, product.prices);
    const stats = computeComparableStorePriceStats(mergedPrices);
    const pickedImage = existing.image === '/pixel-box.svg' && product.image !== '/pixel-box.svg'
      ? product.image
      : existing.image;

    grouped.set(key, {
      ...existing,
      prices: stats.comparablePrices,
      lowestPrice: stats.lowest,
      highestPrice: stats.highest,
      averagePrice: stats.average,
      image: pickedImage,
      updatedAt: existing.updatedAt > product.updatedAt ? existing.updatedAt : product.updatedAt,
      createdAt: existing.createdAt < product.createdAt ? existing.createdAt : product.createdAt,
    });
  }

  const exactDeduped = Array.from(grouped.values());
  const final: Product[] = [];

  for (const candidate of exactDeduped) {
    const targetIndex = final.findIndex((existing) => canFuzzyMerge(existing, candidate));
    if (targetIndex < 0) {
      final.push(candidate);
      continue;
    }

    const existing = final[targetIndex];
    const mergedPrices = mergeGroupedPrices(existing.prices, candidate.prices);
    const stats = computeComparableStorePriceStats(mergedPrices);
    const preferredName = tokenizeNameForDedupe(candidate.name).length > tokenizeNameForDedupe(existing.name).length
      ? candidate.name
      : existing.name;

    final[targetIndex] = {
      ...existing,
      name: preferredName,
      model: preferredName,
      prices: stats.comparablePrices,
      lowestPrice: stats.lowest,
      highestPrice: stats.highest,
      averagePrice: stats.average,
      updatedAt: existing.updatedAt > candidate.updatedAt ? existing.updatedAt : candidate.updatedAt,
      createdAt: existing.createdAt < candidate.createdAt ? existing.createdAt : candidate.createdAt,
    };
  }

  return final;
}

export function recalculateProductPrices(product: Product, allowedStoreIds?: Set<string>): Product | null {
  const filteredPrices = allowedStoreIds
    ? product.prices.filter((priceInfo) => allowedStoreIds.has(priceInfo.storeId.toLowerCase()))
    : product.prices;

  if (filteredPrices.length === 0) return null;

  const stats = computeComparableStorePriceStats(filteredPrices);

  return {
    ...product,
    prices: stats.comparablePrices,
    lowestPrice: stats.lowest,
    highestPrice: stats.highest,
    averagePrice: stats.average,
  };
}

export function sortProducts(products: Product[], sortBy: ProductSort): Product[] {
  const sorted = [...products];

  if (sortBy === 'price-asc') {
    sorted.sort((a, b) => a.lowestPrice - b.lowestPrice);
  } else if (sortBy === 'price-desc') {
    sorted.sort((a, b) => b.lowestPrice - a.lowestPrice);
  } else if (sortBy === 'name') {
    sorted.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  } else if (sortBy === 'newest') {
    sorted.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  return sorted;
}

export function applyDatabaseReadTransforms(
  products: Product[],
  params: {
    searchTerm?: string;
    storeIds?: Set<string>;
    sortBy: ProductSort;
  },
): Product[] {
  let next = products;

  if (params.searchTerm) {
    next = applyTextFilter(next, params.searchTerm);
  }

  next = dedupeProductsByCanonicalName(next);

  if (params.storeIds && params.storeIds.size > 0) {
    next = next
      .map((product) => recalculateProductPrices(product, params.storeIds))
      .filter((product): product is Product => Boolean(product));
  }

  return sortProducts(next, params.sortBy);
}
