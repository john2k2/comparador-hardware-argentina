import {
  isBundleLikeTitle,
  parseCpuModelSignature,
  parseGpuChipSignature,
  type ChipSignature,
} from '@/lib/product-identity';
import type { HardwareCategory, Product } from '@/lib/types';

const PORTABLE_RAM_PATTERN = /\b(sodimm|so\s*dimm|notebook|laptop)\b/;
const RAM_HINT_PATTERN = /\b(ddr[45]|ram|memoria|sodimm|dimm)\b/;

const MEANINGFUL_SINGLE_QUERY_TOKENS = new Set(['x', 'g', 'f', 'k']);
const STRICT_VARIANT_QUERY_TOKENS = new Set([
  'aorus', 'strix', 'tuf', 'dual', 'prime', 'proart', 'eagle', 'windforce',
  'gaming', 'ventus', 'shadow', 'suprim', 'trinity', 'phoenix', 'pulse',
  'nitro', 'challenger', 'hellhound', 'tomahawk', 'mortar', 'ds3h',
  'hero', 'lightspeed',
]);

// Cache simple para normalizacion de texto (evita recomputar en loops calientes)
const NORMALIZE_CACHE = new Map<string, string>();

export function normalizeSearchText(value: string): string {
  const cached = NORMALIZE_CACHE.get(value);
  if (cached !== undefined) return cached;

  const result = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  NORMALIZE_CACHE.set(value, result);
  return result;
}

export function countMatchedQueryWords(name: string, queryWords: string[]): number {
  const normalizedName = normalizeSearchText(name);
  return queryWords.reduce((acc, word) => {
    const escaped = word.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    return acc + (new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`).test(normalizedName) ? 1 : 0);
  }, 0);
}

function shouldKeepByQueryWords(name: string, queryWords: string[]): boolean {
  if (queryWords.length === 0) return true;
  const matched = countMatchedQueryWords(name, queryWords);
  if (queryWords.length === 1) return matched === 1;
  if (queryWords.length === 2) return matched === 2;
  return matched >= Math.ceil(queryWords.length * 0.7);
}

export function parseSingleCharQueryVariants(rawQuery: string): string[] {
  return normalizeSearchText(rawQuery)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length === 1 && MEANINGFUL_SINGLE_QUERY_TOKENS.has(token));
}

export function parseStrictVariantQueryTokens(rawQuery: string): string[] {
  return normalizeSearchText(rawQuery)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .filter((token) => STRICT_VARIANT_QUERY_TOKENS.has(token));
}

export function hasRequiredSingleCharVariants(
  name: string,
  queryWords: string[],
  singleCharVariants: string[],
): boolean {
  if (singleCharVariants.length === 0) return true;

  const modelTokens = queryWords
    .filter((token) => token.length >= 2)
    .filter((token) => /(?=.*[a-z])(?=.*\d)/.test(token) || /^\d{3,5}$/.test(token));
  if (modelTokens.length === 0) return true;

  const normalizedName = normalizeSearchText(name);
  for (const variant of singleCharVariants) {
    const hasVariant = modelTokens.some((modelToken) => {
      if (!modelToken) return false;
      return normalizedName.includes(`${modelToken}${variant}`)
        || new RegExp(`\\b${modelToken}\\s+${variant}\\b`).test(normalizedName);
    });
    if (!hasVariant) return false;
  }

  return true;
}

export function hasRequiredStrictVariants(name: string, strictVariants: string[]): boolean {
  if (strictVariants.length === 0) return true;
  const normalizedName = normalizeSearchText(name);
  return strictVariants.every((variant) => new RegExp(`\\b${variant}\\b`).test(normalizedName));
}

function chipFamilyBasesAgree(queryFamily: string, productFamily: string): boolean {
  if (queryFamily === 'unknown' || productFamily === 'unknown') return true;
  if (queryFamily === productFamily) return true;
  const normalizeFamily = (family: string) => family.replace(/[3579]$/, '');
  return normalizeFamily(queryFamily) === normalizeFamily(productFamily);
}

function chipSignaturesAgree(query: ChipSignature, product: ChipSignature): boolean {
  if (query.number !== product.number) return false;
  if (!chipFamilyBasesAgree(query.family, product.family)) return false;
  if (query.suffixes.length === 0) return true;
  return query.suffixes.join(' ') === product.suffixes.join(' ');
}

export function queryAgreesWithProductModel(query: string, name: string, extraTexts: string[] = []): boolean {
  const normalizedQuery = normalizeSearchText(query);
  const portableHaystack = normalizeSearchText([name, ...extraTexts].join(' '));

  if (
    PORTABLE_RAM_PATTERN.test(portableHaystack)
    && !PORTABLE_RAM_PATTERN.test(normalizedQuery)
    && (RAM_HINT_PATTERN.test(normalizedQuery) || RAM_HINT_PATTERN.test(portableHaystack))
  ) {
    return false;
  }

  const queryGpu = parseGpuChipSignature(query);
  if (queryGpu) {
    const productGpu = parseGpuChipSignature(name);
    if (!productGpu) return false;
    return chipSignaturesAgree(queryGpu, productGpu);
  }

  const queryCpu = parseCpuModelSignature(query);
  if (queryCpu) {
    const productCpu = parseCpuModelSignature(name);
    if (!productCpu) return false;
    return chipSignaturesAgree(queryCpu, productCpu);
  }

  return true;
}

export function shouldKeepByQueryIntent(
  name: string,
  queryWords: string[],
  singleCharVariants: string[],
  strictVariants: string[],
  rawQuery?: string,
): boolean {
  if (!shouldKeepByQueryWords(name, queryWords)) return false;
  if (!hasRequiredSingleCharVariants(name, queryWords, singleCharVariants)) return false;
  if (!hasRequiredStrictVariants(name, strictVariants)) return false;
  if (rawQuery && !queryAgreesWithProductModel(rawQuery, name)) return false;
  return true;
}

export function matchesSearchQueryIntent(
  name: string,
  rawQuery: string,
  extraTexts: string[] = [],
): boolean {
  const queryWords = normalizeSearchText(rawQuery)
    .split(/\s+/)
    .filter((word) => word.length > 1);
  if (!shouldKeepByQueryIntent(
    name,
    queryWords,
    parseSingleCharQueryVariants(rawQuery),
    parseStrictVariantQueryTokens(rawQuery),
    rawQuery,
  )) {
    return false;
  }
  return queryAgreesWithProductModel(rawQuery, name, extraTexts);
}

function hasAvailableOffer(product: Product): boolean {
  if (product.prices.length === 0) return product.lowestPrice > 0;
  return product.prices.some((price) => price.stock !== 'out-of-stock');
}

export function scoreProductRelevance(
  product: Product,
  queryWords: string[],
  rawQuery: string,
  requestedCategory?: HardwareCategory,
): number {
  const normalizedName = normalizeSearchText(product.name);
  const normalizedQuery = normalizeSearchText(rawQuery);
  const matchedWords = countMatchedQueryWords(product.name, queryWords);
  const allWordsMatched = queryWords.length > 0 && matchedWords === queryWords.length;
  const queryLooksBundle = isBundleLikeTitle(rawQuery);
  const productIsBundle = isBundleLikeTitle(product.name);
  const escapedQuery = normalizedQuery.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&').replace(/\\ /g, '\\s+');
  const isExactPhrase = normalizedQuery.length > 0
    && new RegExp(`(?:^|\\s)${escapedQuery}(?:$|\\s)`).test(normalizedName);

  let score = 0;
  score += matchedWords * 25;

  if (allWordsMatched) score += 120;
  if (isExactPhrase) score += 120;
  if (requestedCategory && product.category === requestedCategory) score += 30;
  if (!queryLooksBundle && productIsBundle) score -= 120;

  const minPrice = product.lowestPrice > 0 ? product.lowestPrice : Number.MAX_SAFE_INTEGER;
  score += Math.max(0, 20 - Math.floor(minPrice / 200000));
  return score;
}

export function sortProductsBySearchRelevance(
  products: Product[],
  query: string,
  requestedCategory?: HardwareCategory,
): Product[] {
  const queryWords = normalizeSearchText(query)
    .split(/\s+/)
    .filter((word) => word.length > 1);
  const queryLooksBundle = isBundleLikeTitle(query);

  // P2: Schwartzian transform — computar score una vez por producto,
  // luego ordenar por score. Evita O(n log n) llamadas a scoreProductRelevance.
  const scored = products.map((product) => ({
    product,
    score: scoreProductRelevance(product, queryWords, query, requestedCategory),
    isBundle: !queryLooksBundle && isBundleLikeTitle(product.name),
    hasStock: hasAvailableOffer(product),
  }));

  scored.sort((a, b) => {
    if (a.hasStock !== b.hasStock) return a.hasStock ? -1 : 1;
    if (a.isBundle !== b.isBundle) return a.isBundle ? 1 : -1;
    const scoreDiff = b.score - a.score;
    if (scoreDiff !== 0) return scoreDiff;
    return a.product.lowestPrice - b.product.lowestPrice;
  });

  return scored.map((entry) => entry.product);
}
