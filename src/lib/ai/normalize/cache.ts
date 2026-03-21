import type { MemoryCacheEntry, NormalizationSource } from './types';
import { CACHE_MAX_ENTRIES, FALLBACK_CACHE_TTL_MS } from './config';

const normalizedTitlesCache = new Map<string, MemoryCacheEntry>();

export function upsertMemoryCache(rawTitle: string, normalizedTitle: string, source: NormalizationSource): void {
  const now = Date.now();
  const expiresAtMs = source === 'fallback' ? now + FALLBACK_CACHE_TTL_MS : null;

  if (normalizedTitlesCache.has(rawTitle)) {
    normalizedTitlesCache.delete(rawTitle);
  }

  normalizedTitlesCache.set(rawTitle, {
    normalizedTitle,
    source,
    expiresAtMs,
  });

  while (normalizedTitlesCache.size > CACHE_MAX_ENTRIES) {
    const oldestKey = normalizedTitlesCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    normalizedTitlesCache.delete(oldestKey);
  }
}

export function readMemoryCache(rawTitle: string): string | null {
  const cached = normalizedTitlesCache.get(rawTitle);
  if (!cached) return null;

  if (cached.expiresAtMs !== null && cached.expiresAtMs <= Date.now()) {
    normalizedTitlesCache.delete(rawTitle);
    return null;
  }

  normalizedTitlesCache.delete(rawTitle);
  normalizedTitlesCache.set(rawTitle, cached);

  return cached.normalizedTitle;
}

export function getMemoryCacheSize(): number {
  return normalizedTitlesCache.size;
}
