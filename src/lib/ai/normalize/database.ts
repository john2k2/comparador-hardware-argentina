import { getServerSupabaseServiceClient } from '@/lib/server/supabase-server';
import type { DbNormalizationRow } from './types';
import { chunkArray, formatError } from './utils';
import { upsertMemoryCache } from './cache';
import { normalizeInputTitle, normalizeOutputTitle } from './heuristic';
import { TITLE_DB_CHUNK_SIZE, DB_CACHE_RETRY_AFTER_MS } from './config';

let dbCacheRetryAfterMs = 0;

export async function readNormalizationsFromDatabase(titles: string[]): Promise<Map<string, string>> {
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

export async function saveNormalizationsToDatabase(entries: Array<{ rawTitle: string; normalizedTitle: string }>): Promise<number> {
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
