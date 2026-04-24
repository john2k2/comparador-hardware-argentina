import { getServerSupabaseServiceClient } from '@/lib/server/supabase-server';
import type {
  NormalizeProductTitlesStats,
  NormalizeProductTitlesResult,
  NormalizationSource,
  NormalizationFallbackReason,
  NormalizationMapping,
  NormalizeProductTitlesOptions,
  MemoryCacheEntry,
  DbNormalizationRow,
} from './types';
import { createInitialStats, finalizeStats } from './stats';
import {
  TITLE_DB_CHUNK_SIZE,
  CACHE_MAX_ENTRIES,
  FALLBACK_CACHE_TTL_MS,
  DB_CACHE_RETRY_AFTER_MS,
} from './config';
import {
  TITLE_STOPWORDS,
  TITLE_NOISE_WORDS,
  BRAND_PATTERN,
  GPU_CHIP_PATTERN,
  CPU_CHIP_PATTERN,
  MEMORY_SIZE_PATTERN,
  SOCKET_PATTERN,
  CHIPSET_PATTERN,
  STORAGE_SIZE_PATTERN,
  KNOWN_VARIANTS,
} from './patterns';
import { chunkArray, formatError } from './utils';
import {
  normalizeInputTitle,
  normalizeModelSpacing,
  normalizeForHeuristic,
  buildHeuristicNormalizedTitle,
  normalizeOutputTitle,
} from './heuristic';

export type {
  NormalizeProductTitlesStats,
  NormalizeProductTitlesResult,
  NormalizationSource,
  NormalizationFallbackReason,
  NormalizationMapping,
  NormalizeProductTitlesOptions,
  MemoryCacheEntry,
  DbNormalizationRow,
};

export { createInitialStats, finalizeStats };
export {
  TITLE_DB_CHUNK_SIZE,
  CACHE_MAX_ENTRIES,
  FALLBACK_CACHE_TTL_MS,
  DB_CACHE_RETRY_AFTER_MS,
};
export {
  TITLE_STOPWORDS,
  TITLE_NOISE_WORDS,
  BRAND_PATTERN,
  GPU_CHIP_PATTERN,
  CPU_CHIP_PATTERN,
  MEMORY_SIZE_PATTERN,
  SOCKET_PATTERN,
  CHIPSET_PATTERN,
  STORAGE_SIZE_PATTERN,
  KNOWN_VARIANTS,
};
export { chunkArray, formatError };
export {
  normalizeInputTitle,
  normalizeModelSpacing,
  normalizeForHeuristic,
  buildHeuristicNormalizedTitle,
  normalizeOutputTitle,
};

const normalizedTitlesCache = new Map<string, MemoryCacheEntry>();
let dbCacheRetryAfterMs = 0;

function upsertMemoryCache(rawTitle: string, normalizedTitle: string, source: NormalizationSource): void {
  const now = Date.now();
  const expiresAtMs = source === 'heuristic' ? now + FALLBACK_CACHE_TTL_MS : null;

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

function readMemoryCache(rawTitle: string): string | null {
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

async function readNormalizationsFromDatabase(titles: string[]): Promise<Map<string, string>> {
  const supabase = getServerSupabaseServiceClient();
  const result = new Map<string, string>();
  if (!supabase || titles.length === 0) return result;
  if (Date.now() < dbCacheRetryAfterMs) return result;

  try {
    const chunks = chunkArray(titles, TITLE_DB_CHUNK_SIZE);
    for (const chunk of chunks) {
      const { data, error } = await supabase
        .from('product_title_normalizations')
        .select('raw_title, normalized_title')
        .in('raw_title', chunk);

      if (error) {
        throw new Error(error.message);
      }

      for (const row of (data ?? []) as DbNormalizationRow[]) {
        const rawTitle = normalizeInputTitle(row.raw_title);
        const normalizedTitle = normalizeOutputTitle(rawTitle, row.normalized_title);
        if (!rawTitle) continue;

        result.set(rawTitle, normalizedTitle);
        upsertMemoryCache(rawTitle, normalizedTitle, 'database');
      }
    }
  } catch (error) {
    dbCacheRetryAfterMs = Date.now() + DB_CACHE_RETRY_AFTER_MS;
    console.warn(
      `[Heuristic Normalizer] DB cache read unavailable, fallback to in-memory only for ${Math.round(dbCacheRetryAfterMs / 1000)}s: ${formatError(error)}`,
    );
  }

  return result;
}

async function saveNormalizationsToDatabase(entries: Array<{ rawTitle: string; normalizedTitle: string }>): Promise<number> {
  const supabase = getServerSupabaseServiceClient();
  if (!supabase || entries.length === 0) return 0;
  if (Date.now() < dbCacheRetryAfterMs) return 0;

  try {
    let persisted = 0;
    const payload = entries.map((entry) => ({
      raw_title: entry.rawTitle,
      normalized_title: entry.normalizedTitle,
      source: 'heuristic',
      updated_at: new Date().toISOString(),
    }));

    const chunks = chunkArray(payload, TITLE_DB_CHUNK_SIZE);
    for (const chunk of chunks) {
      const { error } = await supabase
        .from('product_title_normalizations')
        .upsert(chunk, { onConflict: 'raw_title' });

      if (error) {
        throw new Error(error.message);
      }

      persisted += chunk.length;
    }

    return persisted;
  } catch (error) {
    dbCacheRetryAfterMs = Date.now() + DB_CACHE_RETRY_AFTER_MS;
    console.warn(
      `[Heuristic Normalizer] DB cache upsert unavailable, continuing with memory cache only for ${Math.round(dbCacheRetryAfterMs / 1000)}s: ${formatError(error)}`,
    );
    return 0;
  }
}

export { upsertMemoryCache, readMemoryCache };

export async function normalizeProductTitlesWithStats(
  titles: string[],
  options: NormalizeProductTitlesOptions = {},
): Promise<NormalizeProductTitlesResult> {
  const result = new Map<string, string>();
  const useDatabaseCache = options.useDatabaseCache !== false;

  const normalizedInput = Array.from(
    new Set(
      titles
        .map((title) => normalizeInputTitle(title))
        .filter(Boolean),
    ),
  );
  const stats = createInitialStats(titles.length, normalizedInput.length);

  if (normalizedInput.length === 0) {
    return { map: result, stats: finalizeStats(stats) };
  }

  let missingTitles: string[] = [];

  for (const title of normalizedInput) {
    const fromMemory = readMemoryCache(title);
    if (fromMemory) {
      result.set(title, fromMemory);
      stats.memoryHits += 1;
    } else {
      missingTitles.push(title);
    }
  }

  if (useDatabaseCache && missingTitles.length > 0) {
    const dbHits = await readNormalizationsFromDatabase(missingTitles);
    stats.dbHits += dbHits.size;
    missingTitles = missingTitles.filter((title) => {
      const value = dbHits.get(title);
      if (!value) return true;
      result.set(title, value);
      return false;
    });
  }

  if (missingTitles.length === 0) {
    return { map: result, stats: finalizeStats(stats) };
  }

  // Apply heuristic normalization directly (no AI)
  const dbUpserts: Array<{ rawTitle: string; normalizedTitle: string }> = [];
  for (const title of missingTitles) {
    const heuristic = buildHeuristicNormalizedTitle(title);
    result.set(title, heuristic);
    upsertMemoryCache(title, heuristic, 'heuristic');
    stats.heuristicCount += 1;
    stats.fallbackCount += 1;
    stats.fallbackReasons.heuristic += 1;
    dbUpserts.push({ rawTitle: title, normalizedTitle: heuristic });
  }

  if (useDatabaseCache && dbUpserts.length > 0) {
    stats.dbUpsertAttempted += dbUpserts.length;
    stats.dbUpserted += await saveNormalizationsToDatabase(dbUpserts);
  }

  return { map: result, stats: finalizeStats(stats) };
}

export async function normalizeProductTitles(
  titles: string[],
  options: NormalizeProductTitlesOptions = {},
): Promise<Map<string, string>> {
  const normalized = await normalizeProductTitlesWithStats(titles, options);
  return normalized.map;
}
