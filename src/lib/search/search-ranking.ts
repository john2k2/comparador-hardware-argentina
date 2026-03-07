import { isBundleLikeTitle } from '@/lib/product-identity';
import type { HardwareCategory, Product } from '@/lib/types';

const MEANINGFUL_SINGLE_QUERY_TOKENS = new Set(['x', 'g', 'f', 'k']);
const STRICT_VARIANT_QUERY_TOKENS = new Set([
  'aorus', 'strix', 'tuf', 'dual', 'prime', 'proart', 'eagle', 'windforce',
  'gaming', 'ventus', 'shadow', 'suprim', 'trinity', 'phoenix', 'pulse',
  'nitro', 'challenger', 'hellhound', 'tomahawk', 'mortar', 'ds3h',
  'hero', 'lightspeed',
]);

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function countMatchedQueryWords(name: string, queryWords: string[]): number {
  const normalizedName = normalizeSearchText(name);
  return queryWords.reduce((acc, word) => acc + (normalizedName.includes(word) ? 1 : 0), 0);
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

export function shouldKeepByQueryIntent(
  name: string,
  queryWords: string[],
  singleCharVariants: string[],
  strictVariants: string[],
): boolean {
  if (!shouldKeepByQueryWords(name, queryWords)) return false;
  if (!hasRequiredSingleCharVariants(name, queryWords, singleCharVariants)) return false;
  return hasRequiredStrictVariants(name, strictVariants);
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
  const isExactPhrase = normalizedQuery.length > 0 && normalizedName.includes(normalizedQuery);

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

  return [...products].sort((a, b) => {
    if (!queryLooksBundle) {
      const aBundle = isBundleLikeTitle(a.name);
      const bBundle = isBundleLikeTitle(b.name);
      if (aBundle !== bBundle) return aBundle ? 1 : -1;
    }

    const scoreDiff = scoreProductRelevance(b, queryWords, query, requestedCategory)
      - scoreProductRelevance(a, queryWords, query, requestedCategory);
    if (scoreDiff !== 0) return scoreDiff;
    return a.lowestPrice - b.lowestPrice;
  });
}
