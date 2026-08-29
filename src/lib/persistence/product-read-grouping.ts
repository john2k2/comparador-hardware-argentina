import { computeComparableStorePriceStats, preferStorePrice } from '@/lib/price-utils';
import {
  buildProductIdentityKey,
  compactGpuChip,
  extractExactModelIdentity,
  isCompleteComputerTitle,
  normalizeIdentityText,
  parseCpuModelSignature,
  parseGpuChipSignature,
} from '@/lib/product-identity';
import { matchesSearchQueryIntent, sortProductsBySearchRelevance } from '@/lib/search/search-ranking';
import type { Product } from '@/lib/types';
import type { ProductSort } from '@/lib/persistence/product-read-types';

const DEDUPE_STOPWORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'y', 'con', 'para', 'por',
  'vga', 'placa', 'video', 'procesador', 'micro', 'cpu', 'gpu', 'gamer',
]);

const COMPONENT_BUNDLE_TERMS = [
  'pc gamer',
  'combo',
  'armado',
  'armada',
  'pc completa',
  'pc creadores',
  'computadora',
  'desktop',
  'workstation',
  'notebook',
  'laptop',
  'all in one',
  'netbook',
  'chromebook',
  'bundle',
  'paquete',
];

function isStandaloneComponentProduct(product: Product): boolean {
  if (!['procesadores', 'tarjetas-graficas', 'memoria-ram'].includes(product.category)) return true;
  const normalizedName = normalizeGroupName(product.name);
  return !isCompleteComputerTitle(product.name)
    && !COMPONENT_BUNDLE_TERMS.some((term) => normalizedName.includes(term));
}

function matchesQueryToken(searchable: string, word: string): boolean {
  const escaped = word.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  return new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`).test(searchable);
}

function hasDisplayableComparablePrice(product: Product): boolean {
  return product.prices.length > 0 && Number.isFinite(product.lowestPrice) && product.lowestPrice > 0;
}

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
    return words.every((word) => matchesQueryToken(searchable, word));
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
  const gpu = parseGpuChipSignature(normalized);
  const cpu = parseCpuModelSignature(normalized);
  const chip = gpu
    ? compactGpuChip(gpu)
    : cpu && cpu.family !== 'unknown'
      ? `${cpu.family}${cpu.number}${cpu.suffixes.join('')}`
      : null;
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
  if (existingExactModel && candidateExactModel) {
    return existingExactModel === candidateExactModel;
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
    const existingIndex = merged.findIndex((price) => price.storeId.toLowerCase() === candidate.storeId.toLowerCase());
    if (existingIndex < 0) {
      merged.push(candidate);
      continue;
    }

    merged[existingIndex] = preferStorePrice(merged[existingIndex], candidate);
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
    minPrice?: number;
    maxPrice?: number;
    sortBy: ProductSort;
  },
): Product[] {
  let next = products;

  if (params.searchTerm) {
    next = applyTextFilter(next, params.searchTerm);
    next = next.filter((product) => matchesSearchQueryIntent(
      product.name,
      params.searchTerm!,
      product.prices.map((price) => price.url),
    ));
  }

  next = dedupeProductsByCanonicalName(next);

  next = next.filter((product) => isStandaloneComponentProduct(product) && hasDisplayableComparablePrice(product));

  if (params.storeIds && params.storeIds.size > 0) {
    next = next
      .map((product) => recalculateProductPrices(product, params.storeIds))
      .filter((product): product is Product => Boolean(product));
  }

  if (params.minPrice !== undefined) {
    next = next.filter((product) => product.lowestPrice >= params.minPrice!);
  }

  if (params.maxPrice !== undefined) {
    next = next.filter((product) => product.lowestPrice <= params.maxPrice!);
  }

  if (params.sortBy === 'relevance' && params.searchTerm) {
    return sortProductsBySearchRelevance(next, params.searchTerm);
  }

  return sortProducts(next, params.sortBy);
}
