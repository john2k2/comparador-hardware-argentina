/**
 * Search client-side caching utilities
 * Handles sessionStorage for search results and scroll position
 */

import type { SearchApiResponse } from './search-api';

const CLIENT_SEARCH_CACHE_TTL_MS = 90 * 1000;
const CLIENT_SEARCH_STORAGE_PREFIX = 'search-cache:v3:';
const SEARCH_SCROLL_STORAGE_PREFIX = 'search-scroll:v1:';
const SEARCH_SCROLL_TTL_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------------------
// Search Result Cache
// ---------------------------------------------------------------------------

export function getSearchCacheKey(cacheKey: string): string {
  return `${CLIENT_SEARCH_STORAGE_PREFIX}${cacheKey}`;
}

export function normalizeSearchPayload(payload: SearchApiResponse): SearchApiResponse {
  return {
    ...payload,
    products: payload.products ?? [],
  };
}

export function readStoredSearch(cacheKey: string): { expiresAt: number; payload: SearchApiResponse } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(getSearchCacheKey(cacheKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { expiresAt?: number; payload?: SearchApiResponse };
    if (!parsed.expiresAt || !parsed.payload || !Array.isArray(parsed.payload.products)) return null;
    if (parsed.expiresAt <= Date.now()) {
      window.sessionStorage.removeItem(getSearchCacheKey(cacheKey));
      return null;
    }
    return { expiresAt: parsed.expiresAt, payload: normalizeSearchPayload(parsed.payload) };
  } catch {
    return null;
  }
}

export function writeStoredSearch(cacheKey: string, value: { expiresAt: number; payload: SearchApiResponse }) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(getSearchCacheKey(cacheKey), JSON.stringify(value));
  } catch {
    // Ignore storage quota errors.
  }
}

export function createSearchCacheEntry(payload: SearchApiResponse) {
  return {
    payload,
    expiresAt: Date.now() + CLIENT_SEARCH_CACHE_TTL_MS,
  };
}

// ---------------------------------------------------------------------------
// Scroll Position Storage
// ---------------------------------------------------------------------------

type StoredScrollPayload = {
  y?: number;
  savedAt?: number;
};

export function readStoredScrollPosition(searchRoute: string): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(`${SEARCH_SCROLL_STORAGE_PREFIX}${searchRoute}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as StoredScrollPayload;
    const y = typeof parsed.y === 'number' && Number.isFinite(parsed.y) ? parsed.y : null;
    const savedAt = typeof parsed.savedAt === 'number' && Number.isFinite(parsed.savedAt) ? parsed.savedAt : 0;

    if (y === null || y < 0) return null;
    if (savedAt > 0 && Date.now() - savedAt > SEARCH_SCROLL_TTL_MS) {
      window.sessionStorage.removeItem(`${SEARCH_SCROLL_STORAGE_PREFIX}${searchRoute}`);
      return null;
    }

    return Math.round(y);
  } catch {
    return null;
  }
}

export function clearStoredScrollPosition(searchRoute: string) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(`${SEARCH_SCROLL_STORAGE_PREFIX}${searchRoute}`);
  } catch {
    // Ignore storage failures.
  }
}
