import { GoogleGenAI, Type } from '@google/genai';
import { withAbortTimeout } from '@/lib/async/with-abort-timeout';
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
  GEMINI_PRIMARY_MODEL,
  GEMINI_MODEL_CANDIDATES,
  DEFAULT_MAX_TITLES_PER_BATCH,
  MAX_TITLES_PER_BATCH,
  DEFAULT_MAX_BATCHES_PER_REQUEST,
  MAX_BATCHES_PER_REQUEST,
  DEFAULT_GEMINI_BATCH_CONCURRENCY,
  GEMINI_BATCH_CONCURRENCY,
  TITLE_DB_CHUNK_SIZE,
  CACHE_MAX_ENTRIES,
  FALLBACK_CACHE_TTL_MS,
  DEFAULT_GEMINI_BATCH_TIMEOUT_MS,
  GEMINI_BATCH_TIMEOUT_MS,
  GEMINI_RETRY_AFTER_QUOTA_MS,
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
import { chunkArray, formatError, isQuotaError, isModelNotAvailableError } from './utils';
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
  GEMINI_PRIMARY_MODEL,
  GEMINI_MODEL_CANDIDATES,
  DEFAULT_MAX_TITLES_PER_BATCH,
  MAX_TITLES_PER_BATCH,
  DEFAULT_MAX_BATCHES_PER_REQUEST,
  MAX_BATCHES_PER_REQUEST,
  DEFAULT_GEMINI_BATCH_CONCURRENCY,
  GEMINI_BATCH_CONCURRENCY,
  TITLE_DB_CHUNK_SIZE,
  CACHE_MAX_ENTRIES,
  FALLBACK_CACHE_TTL_MS,
  DEFAULT_GEMINI_BATCH_TIMEOUT_MS,
  GEMINI_BATCH_TIMEOUT_MS,
  GEMINI_RETRY_AFTER_QUOTA_MS,
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
export { chunkArray, formatError, isQuotaError, isModelNotAvailableError };
export {
  normalizeInputTitle,
  normalizeModelSpacing,
  normalizeForHeuristic,
  buildHeuristicNormalizedTitle,
  normalizeOutputTitle,
};

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

const normalizedTitlesCache = new Map<string, MemoryCacheEntry>();
let retryGeminiAfterMs = 0;
let dbCacheRetryAfterMs = 0;

function upsertMemoryCache(rawTitle: string, normalizedTitle: string, source: NormalizationSource): void {
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

function buildPrompt(titles: string[], queryContext?: string): string {
  const promptLines = [
    'You are a PC hardware catalog normalization engine.',
    'Given raw product titles from different stores, return canonical titles for strict product grouping across ALL product types.',
    'Rules:',
    '1) Keep brand + exact model/chipset/GPU/CPU + exact variant + exact capacity.',
    '2) Remove noise words like Placa de Video, VGA, Gamer, Oferta, OEM, Box.',
    '3) Never merge different products. RTX 4060 != RTX 4060 Ti.',
    '4) CPU suffix is mandatory and changes product identity: 5600 != 5600G != 5600GT != 5600X.',
    '5) Keep board/AIB line variants when present: ASUS Prime != ASUS Dual, Gigabyte Aorus != Gigabyte DS3H.',
    '6) Apply the same strictness to peripherals and accessories: Logitech K120 != Logitech K380, G502 != G502 X.',
    '7) Same exact hardware must produce the exact same canonical title string.',
    '8) Same exact product family from different stores should collapse to one canonical title.',
    '9) Use concise title case.',
  ];

  if (queryContext?.trim()) {
    promptLines.push(`Search query context: ${queryContext.trim()}`);
  }

  promptLines.push(
    `Raw titles JSON: ${JSON.stringify(titles)}`,
  );

  return promptLines.join('\n');
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
      `[Gemini Normalizer] DB cache read unavailable, fallback to in-memory only for ${Math.round(dbCacheRetryAfterMs / 1000)}s: ${formatError(error)}`,
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
      source: 'gemini',
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
      `[Gemini Normalizer] DB cache upsert unavailable, continuing with memory cache only for ${Math.round(dbCacheRetryAfterMs / 1000)}s: ${formatError(error)}`,
    );
    return 0;
  }
}

async function normalizeBatchWithGemini(
  batchTitles: string[],
  queryContext?: string,
): Promise<{ model: string; mappings: NormalizationMapping[] }> {
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  let lastError: unknown;

  for (const model of GEMINI_MODEL_CANDIDATES) {
    try {
      const response = await withAbortTimeout(
        (signal) => ai.models.generateContent({
          model,
          contents: buildPrompt(batchTitles, queryContext),
          config: {
            temperature: 0.1,
            responseMimeType: 'application/json',
            abortSignal: signal,
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                normalizedMap: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      originalTitle: { type: Type.STRING },
                      standardTitle: { type: Type.STRING },
                    },
                    required: ['originalTitle', 'standardTitle'],
                  },
                },
              },
              required: ['normalizedMap'],
            },
          },
        }),
        GEMINI_BATCH_TIMEOUT_MS,
        `gemini-normalizer:${model}`,
      );

      const responseText = response.text;
      if (!responseText) {
        throw new Error('Empty Gemini response body');
      }

      const parsed = JSON.parse(responseText) as { normalizedMap?: NormalizationMapping[] };
      const mappings = Array.isArray(parsed.normalizedMap) ? parsed.normalizedMap : [];

      return { model, mappings };
    } catch (error) {
      lastError = error;

      if (isModelNotAvailableError(error)) {
        console.warn(`[Gemini Normalizer] Model ${model} unavailable, trying next model.`);
        continue;
      }

      throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('No Gemini model candidate could normalize titles');
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

  if (!ai || Date.now() < retryGeminiAfterMs) {
    const fallbackReason: NormalizationFallbackReason = !ai ? 'no_ai' : 'quota_backoff';
    for (const title of missingTitles) {
      const heuristic = buildHeuristicNormalizedTitle(title);
      result.set(title, heuristic);
      upsertMemoryCache(title, heuristic, 'fallback');
    }
    stats.fallbackCount += missingTitles.length;
    stats.fallbackReasons[fallbackReason] += missingTitles.length;
    return { map: result, stats: finalizeStats(stats) };
  }

  const maxTitlesToSend = MAX_TITLES_PER_BATCH * MAX_BATCHES_PER_REQUEST;
  const aiCandidates = missingTitles.slice(0, maxTitlesToSend);
  const deferredFallback = missingTitles.slice(maxTitlesToSend);

  if (deferredFallback.length > 0) {
    console.log(`[Gemini Normalizer] Deferred ${deferredFallback.length} titles to fallback to keep latency stable.`);
    for (const title of deferredFallback) {
      const heuristic = buildHeuristicNormalizedTitle(title);
      result.set(title, heuristic);
      upsertMemoryCache(title, heuristic, 'fallback');
    }
    stats.fallbackCount += deferredFallback.length;
    stats.deferredFallbackCount += deferredFallback.length;
    stats.fallbackReasons.deferred_budget += deferredFallback.length;
  }

  const batches = chunkArray(aiCandidates, MAX_TITLES_PER_BATCH);
  const dbUpserts: Array<{ rawTitle: string; normalizedTitle: string }> = [];
  for (let index = 0; index < batches.length; index += GEMINI_BATCH_CONCURRENCY) {
    const windowBatches = batches.slice(index, index + GEMINI_BATCH_CONCURRENCY);

    const windowResults = await Promise.all(windowBatches.map(async (batch) => {
      const batchStartMs = Date.now();

      try {
        const { model, mappings } = await normalizeBatchWithGemini(batch, options.queryContext);
        const mappingByOriginal = new Map<string, string>();

        for (const mapping of mappings) {
          const rawTitle = normalizeInputTitle(mapping.originalTitle);
          if (!rawTitle) continue;
          mappingByOriginal.set(rawTitle, normalizeOutputTitle(rawTitle, mapping.standardTitle));
        }

        const entries = batch.map((rawTitle) => ({
          rawTitle,
          normalizedTitle: normalizeOutputTitle(rawTitle, mappingByOriginal.get(rawTitle)),
          source: 'gemini' as const,
        }));

        return {
          batchSize: batch.length,
          latencyMs: Date.now() - batchStartMs,
          model,
          entries,
          errorMessage: null as string | null,
        };
      } catch (error) {
        if (isQuotaError(error)) {
          retryGeminiAfterMs = Date.now() + GEMINI_RETRY_AFTER_QUOTA_MS;
        }

        const entries = batch.map((rawTitle) => ({
          rawTitle,
          normalizedTitle: buildHeuristicNormalizedTitle(rawTitle),
          source: 'fallback' as const,
        }));

        return {
          batchSize: batch.length,
          latencyMs: Date.now() - batchStartMs,
          model: null as string | null,
          entries,
          errorMessage: formatError(error),
        };
      }
    }));

    for (const batchResult of windowResults) {
      if (batchResult.model) {
        stats.geminiBatches += 1;
        console.log(
          `[Gemini Normalizer] Batch ${batchResult.batchSize} titles normalized with ${batchResult.model} in ${batchResult.latencyMs}ms.`,
        );
      } else {
        stats.geminiBatchFailures += 1;
        console.warn(`[Gemini Normalizer] Batch failed, using fallback normalization: ${batchResult.errorMessage}`);
      }

      for (const entry of batchResult.entries) {
        result.set(entry.rawTitle, entry.normalizedTitle);
        upsertMemoryCache(entry.rawTitle, entry.normalizedTitle, entry.source);
        if (entry.source === 'gemini') {
          stats.geminiCount += 1;
          dbUpserts.push({
            rawTitle: entry.rawTitle,
            normalizedTitle: entry.normalizedTitle,
          });
        } else {
          stats.fallbackCount += 1;
          stats.fallbackReasons.batch_error += 1;
        }
      }
    }
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
