/**
 * Product detail client-side caching utilities
 */

import type { Product } from '@/lib/types';

const CLIENT_DETAIL_CACHE_TTL_MS = 5 * 60 * 1000;
const PRODUCT_DETAIL_STORAGE_PREFIX = 'product-detail:v2:';

// ---------------------------------------------------------------------------
// Date Normalization
// ---------------------------------------------------------------------------

export function toDateValue(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date(0);
}

export function normalizeFetchedProduct(product: Product): Product {
  return {
    ...product,
    createdAt: toDateValue(product.createdAt),
    updatedAt: toDateValue(product.updatedAt),
    prices: (product.prices ?? []).map((price) => ({
      ...price,
      lastUpdated: toDateValue(price.lastUpdated),
    })),
  };
}

// ---------------------------------------------------------------------------
// Storage Keys
// ---------------------------------------------------------------------------

export function getProductStorageKey(id: string): string {
  return `${PRODUCT_DETAIL_STORAGE_PREFIX}${id}`;
}

// ---------------------------------------------------------------------------
// In-Memory Cache
// ---------------------------------------------------------------------------

const clientProductDetailCache = new Map<string, { expiresAt: number; product: Product | null }>();

export function getCachedProduct(id: string) {
  const cached = clientProductDetailCache.get(id);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.product;
  }
  return null;
}

export function setCachedProduct(id: string, product: Product | null) {
  const entry = { expiresAt: Date.now() + CLIENT_DETAIL_CACHE_TTL_MS, product };
  clientProductDetailCache.set(id, entry);
}

// ---------------------------------------------------------------------------
// Session Storage
// ---------------------------------------------------------------------------

export function readStoredProduct(id: string): { expiresAt: number; product: Product | null } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(getProductStorageKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { expiresAt?: number; product?: Product | null };
    if (!parsed.expiresAt) return null;
    if (parsed.expiresAt <= Date.now()) {
      window.sessionStorage.removeItem(getProductStorageKey(id));
      return null;
    }
    return { expiresAt: parsed.expiresAt, product: parsed.product ?? null };
  } catch {
    return null;
  }
}

export function writeStoredProduct(id: string, value: { expiresAt: number; product: Product | null }) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(getProductStorageKey(id), JSON.stringify(value));
  } catch {
    // Ignore storage quota errors.
  }
}

// ---------------------------------------------------------------------------
// Navigation Helper
// ---------------------------------------------------------------------------

export function resolveBackHref(fromParam: string | null): string {
  if (!fromParam) return '/search';
  let decoded = fromParam;
  for (let index = 0; index < 3; index += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  return decoded.startsWith('/search') ? decoded : '/search';
}
