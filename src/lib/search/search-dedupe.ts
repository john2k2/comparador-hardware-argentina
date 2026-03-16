import { computeComparableStorePriceStats } from '@/lib/price-utils';
import {
  buildProductFamilyKey,
  buildProductIdentityKey,
  buildProductVariantKey,
  extractExactModelIdentity,
} from '@/lib/product-identity';
import { normalizeSearchText, scoreProductRelevance } from '@/lib/search/search-ranking';
import type { HardwareCategory, Product } from '@/lib/types';

const DEDUPE_STOPWORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'y', 'con', 'para', 'por',
  'vga', 'placa', 'video', 'procesador', 'micro', 'cpu', 'gpu', 'gamer',
]);

function slugifyGroupPart(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function hashGroupKey(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function buildGroupedProductId(product: Product, normalizedTitle: string, groupKey: string): string {
  const readable = slugifyGroupPart(normalizedTitle).slice(0, 48) || 'item';
  const fingerprint = hashGroupKey(`${product.category}|${groupKey}`);
  return `agrupado-${product.category}-${readable}-${fingerprint}`;
}

function buildIdentityFallback(product: Product): string {
  return [product.brand, product.model, product.name]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(' ');
}

function buildCanonicalGroupKey(product: Product, normalizedTitle: string): string {
  return buildProductIdentityKey(product.category, normalizedTitle, buildIdentityFallback(product));
}

function mergePriceOptions(
  current: Product['prices'],
  incoming: Product['prices'],
): Product['prices'] {
  const merged = [...current];

  for (const candidate of incoming) {
    const existingIndex = merged.findIndex((price) => price.storeId === candidate.storeId);
    if (existingIndex < 0) {
      merged.push(candidate);
      continue;
    }

    const existing = merged[existingIndex];
    const candidateIsBetter = candidate.price < existing.price
      || (existing.stock === 'out-of-stock' && candidate.stock !== 'out-of-stock');

    if (candidateIsBetter) {
      merged[existingIndex] = candidate;
    }
  }

  return merged;
}

function tokenizeForDedupe(value: string): string[] {
  return normalizeSearchText(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1)
    .filter((token) => !DEDUPE_STOPWORDS.has(token));
}

function extractFingerprint(value: string): { brand: string | null; chip: string | null; memory: string | null } {
  const normalized = normalizeSearchText(value);
  const brand = (normalized.match(/\b(asus|gigabyte|msi|zotac|palit|inno3d|asrock|pny|xfx|sapphire|amd|intel)\b/) ?? [])[1] ?? null;
  const chip = (normalized.match(/\b(rtx\s*\d{3,4}(?:\s*(?:ti|super))?|rx\s*\d{3,4}(?:\s*xt)?|ryzen\s*[3579]\s*\d{3,5}(?:x3d|gt|ge|xt|x|g|f)?|core\s*i[3579]\s*\d{4,5}[a-z]{0,2})\b/) ?? [])[1]?.replace(/\s+/g, '') ?? null;
  const memory = (normalized.match(/\b(\d{1,2}\s*gb)\b/) ?? [])[1]?.replace(/\s+/g, '') ?? null;
  return { brand, chip, memory };
}

function shareStoreAndPrice(first: Product, second: Product): boolean {
  for (const a of first.prices) {
    for (const b of second.prices) {
      if (a.storeId === b.storeId && a.price === b.price) {
        return true;
      }
    }
  }
  return false;
}

function isSubset(first: Set<string>, second: Set<string>): boolean {
  if (first.size === 0 || second.size === 0) return false;
  if (first.size > second.size) return false;
  for (const token of first) {
    if (!second.has(token)) return false;
  }
  return true;
}

function canMergeNearDuplicate(existing: Product, candidate: Product): boolean {
  if (existing.category !== candidate.category) return false;

  const existingExactModel = extractExactModelIdentity(existing.category, existing.name);
  const candidateExactModel = extractExactModelIdentity(candidate.category, candidate.name);
  if (existingExactModel && candidateExactModel && existingExactModel === candidateExactModel) {
    return true;
  }

  const existingFingerprint = extractFingerprint(existing.name);
  const candidateFingerprint = extractFingerprint(candidate.name);

  if (!shareStoreAndPrice(existing, candidate)) return false;

  if (!existingFingerprint.chip || !candidateFingerprint.chip) return false;
  if (existingFingerprint.chip !== candidateFingerprint.chip) return false;
  if (existingFingerprint.brand && candidateFingerprint.brand && existingFingerprint.brand !== candidateFingerprint.brand) return false;
  if (existingFingerprint.memory && candidateFingerprint.memory && existingFingerprint.memory !== candidateFingerprint.memory) return false;

  const existingTokens = new Set(tokenizeForDedupe(existing.name));
  const candidateTokens = new Set(tokenizeForDedupe(candidate.name));
  return isSubset(existingTokens, candidateTokens) || isSubset(candidateTokens, existingTokens);
}

function mergeProductEntries(existing: Product, candidate: Product): Product {
  const mergedPrices = mergePriceOptions(existing.prices, candidate.prices);
  const stats = computeComparableStorePriceStats(mergedPrices);
  const existingTokens = tokenizeForDedupe(existing.name).length;
  const candidateTokens = tokenizeForDedupe(candidate.name).length;
  const preferred = candidateTokens > existingTokens ? candidate : existing;
  const mergedImage = existing.image === '/pixel-box.svg' && candidate.image !== '/pixel-box.svg'
    ? candidate.image
    : existing.image;

  return {
    ...existing,
    name: preferred.name,
    model: preferred.model,
    brand: preferred.brand,
    image: mergedImage,
    prices: stats.comparablePrices,
    lowestPrice: stats.lowest,
    highestPrice: stats.highest,
    averagePrice: stats.average,
    updatedAt: existing.updatedAt > candidate.updatedAt ? existing.updatedAt : candidate.updatedAt,
  };
}

export function dedupeNearDuplicates(products: Product[]): Product[] {
  if (products.length <= 1) return products;
  const deduped: Product[] = [];

  for (const candidate of products) {
    const index = deduped.findIndex((existing) => canMergeNearDuplicate(existing, candidate));
    if (index < 0) {
      deduped.push(candidate);
      continue;
    }

    deduped[index] = mergeProductEntries(deduped[index], candidate);
  }

  return deduped;
}

export function filterProductStores(product: Product, selectedStoreIds: Set<string>): Product | null {
  if (selectedStoreIds.size === 0) return product;

  const prices = product.prices.filter((priceInfo) => selectedStoreIds.has(priceInfo.storeId.toLowerCase()));
  if (prices.length === 0) return null;

  const stats = computeComparableStorePriceStats(prices);
  return {
    ...product,
    prices: stats.comparablePrices,
    lowestPrice: stats.lowest,
    highestPrice: stats.highest,
    averagePrice: stats.average,
  };
}

export function groupSearchProducts(
  liveProducts: Product[],
  normalizedTitlesMap: Map<string, string>,
  queryWords: string[],
  query: string,
  category?: HardwareCategory,
): Product[] {
  const uniqueMap = new Map<string, Product>();

  for (const product of liveProducts) {
    const normalizedName = normalizedTitlesMap.get(product.name) || product.name;
    const groupKey = buildCanonicalGroupKey(product, normalizedName);
    const identityFallback = buildIdentityFallback(product);
    const familyKey = buildProductFamilyKey(product.category, normalizedName, identityFallback) ?? undefined;
    const variantKey = buildProductVariantKey(product.category, normalizedName, identityFallback);

    if (!uniqueMap.has(groupKey)) {
      const stats = computeComparableStorePriceStats(product.prices);

      uniqueMap.set(groupKey, {
        ...product,
        id: buildGroupedProductId(product, normalizedName, groupKey),
        prices: stats.comparablePrices,
        lowestPrice: stats.lowest,
        highestPrice: stats.highest,
        averagePrice: stats.average,
        normalizedTitle: normalizedName,
        canonicalProductKey: groupKey,
        familyKey,
        variantKey,
      });
      continue;
    }

    const existingProduct = uniqueMap.get(groupKey)!;
    const mergedPrices = mergePriceOptions(existingProduct.prices, product.prices);
    const stats = computeComparableStorePriceStats(mergedPrices);

    let finalImage = existingProduct.image;
    if (finalImage === '/pixel-box.svg' && product.image !== '/pixel-box.svg') {
      finalImage = product.image;
    }

    const existingScore = scoreProductRelevance(existingProduct, queryWords, query, category);
    const incomingScore = scoreProductRelevance(product, queryWords, query, category);
    const shouldReplaceDisplay = incomingScore > existingScore;

    uniqueMap.set(groupKey, {
      ...existingProduct,
      prices: stats.comparablePrices,
      lowestPrice: stats.lowest,
      highestPrice: stats.highest,
      averagePrice: stats.average,
      image: finalImage,
      name: shouldReplaceDisplay ? product.name : existingProduct.name,
      model: shouldReplaceDisplay ? product.model : existingProduct.model,
      brand: shouldReplaceDisplay ? product.brand : existingProduct.brand,
      normalizedTitle: shouldReplaceDisplay ? normalizedName : existingProduct.normalizedTitle,
      canonicalProductKey: groupKey,
      familyKey: existingProduct.familyKey ?? familyKey,
      variantKey: existingProduct.variantKey ?? variantKey,
      updatedAt: existingProduct.updatedAt > product.updatedAt ? existingProduct.updatedAt : product.updatedAt,
    });
  }

  return dedupeNearDuplicates(Array.from(uniqueMap.values()));
}
