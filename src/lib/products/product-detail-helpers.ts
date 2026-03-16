import type { Product } from '@/lib/types';

export function normalizeId(value: string): string {
  let decoded = value.trim();
  for (let i = 0; i < 3; i += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }

  return decoded
    .toLowerCase()
    .replace(/%2e/gi, '.')
    .replace(/\+/g, '-')
    .replace(/_/g, '-')
    .replace(/\./g, '-')
    .replace(/\/+$/g, '')
    .replace(/-+/g, '-')
    .trim();
}

export function extractPrefixAndCode(id: string): { prefix: string; code?: string } {
  const normalized = normalizeId(id);
  const parts = normalized.split('-').filter(Boolean);
  const prefix = parts[0] ?? '';
  const second = parts[1];

  return {
    prefix,
    code: second && /^\d+$/.test(second) ? second : undefined,
  };
}

export function buildDetailSearchQuery(id: string): string {
  const parts = normalizeId(id).split('-').filter(Boolean);
  if (parts.length <= 1) return normalizeId(id);

  const secondIsCode = /^\d+$/.test(parts[1] ?? '');
  const queryParts = secondIsCode ? parts.slice(2) : parts.slice(1);
  const rawQuery = queryParts.join(' ');

  return rawQuery
    .replace(/[^a-z0-9+\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeForQueryMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeQueryWords(value: string): string[] {
  return normalizeForQueryMatch(value)
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 1);
}

export function countMatchedQueryWords(name: string, queryWords: string[]): number {
  if (queryWords.length === 0) return 0;
  const normalizedName = normalizeForQueryMatch(name);
  return queryWords.reduce((acc, word) => acc + (normalizedName.includes(word) ? 1 : 0), 0);
}

export function shouldKeepByQueryWords(name: string, queryWords: string[]): boolean {
  if (queryWords.length === 0) return true;
  const matched = countMatchedQueryWords(name, queryWords);
  if (queryWords.length === 1) return matched === 1;
  if (queryWords.length === 2) return matched === 2;
  return matched >= Math.ceil(queryWords.length * 0.7);
}

export function findBestProductMatch(targetId: string, products: Product[]): Product | undefined {
  if (products.length === 0) return undefined;

  const normalizedTarget = normalizeId(targetId);
  const exact = products.find((product) => normalizeId(product.id) === normalizedTarget);
  if (exact) return exact;

  const { prefix: targetPrefix, code: targetCode } = extractPrefixAndCode(normalizedTarget);
  if (!targetPrefix) return undefined;

  const sameStoreProducts = products.filter((product) => extractPrefixAndCode(product.id).prefix === targetPrefix);
  if (sameStoreProducts.length === 0) return undefined;

  if (targetCode) {
    const withSameCode = sameStoreProducts.filter((product) => extractPrefixAndCode(product.id).code === targetCode);
    if (withSameCode.length > 0) {
      return withSameCode[0];
    }
  }

  return sameStoreProducts.find((product) => normalizeId(product.id).includes(normalizedTarget));
}

function isValidHttpUrl(value: string): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function pickDescriptionUrls(product: Product): string[] {
  const orderedPrices = [...(product.prices ?? [])].sort((a, b) => a.price - b.price);
  const candidates = orderedPrices.map((price) => price.url).filter((url): url is string => isValidHttpUrl(url));
  return Array.from(new Set(candidates)).slice(0, 2);
}
