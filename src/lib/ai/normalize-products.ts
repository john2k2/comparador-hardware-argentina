import { GoogleGenAI, Type } from '@google/genai';
import { getServerSupabaseServiceClient } from '@/lib/server/supabase-server';
import { withAbortTimeout } from '@/lib/async/with-abort-timeout';

type NormalizationSource = 'gemini' | 'database' | 'fallback';
export type NormalizationFallbackReason = 'no_ai' | 'quota_backoff' | 'deferred_budget' | 'batch_error';

export interface NormalizeProductTitlesStats {
  requestedTitles: number;
  uniqueTitles: number;
  memoryHits: number;
  dbHits: number;
  geminiCount: number;
  fallbackCount: number;
  deferredFallbackCount: number;
  geminiBatches: number;
  geminiBatchFailures: number;
  dbUpsertAttempted: number;
  dbUpserted: number;
  fallbackRatePct: number;
  fallbackReasons: Record<NormalizationFallbackReason, number>;
}

export interface NormalizeProductTitlesResult {
  map: Map<string, string>;
  stats: NormalizeProductTitlesStats;
}

type MemoryCacheEntry = {
  normalizedTitle: string;
  source: NormalizationSource;
  expiresAtMs: number | null;
};

type NormalizationMapping = {
  originalTitle: string;
  standardTitle: string;
};

type DbNormalizationRow = {
  raw_title: string;
  normalized_title: string;
};

type NormalizeProductTitlesOptions = {
  useDatabaseCache?: boolean;
  queryContext?: string;
};

function createInitialStats(requestedTitles: number, uniqueTitles: number): NormalizeProductTitlesStats {
  return {
    requestedTitles,
    uniqueTitles,
    memoryHits: 0,
    dbHits: 0,
    geminiCount: 0,
    fallbackCount: 0,
    deferredFallbackCount: 0,
    geminiBatches: 0,
    geminiBatchFailures: 0,
    dbUpsertAttempted: 0,
    dbUpserted: 0,
    fallbackRatePct: 0,
    fallbackReasons: {
      no_ai: 0,
      quota_backoff: 0,
      deferred_budget: 0,
      batch_error: 0,
    },
  };
}

function finalizeStats(stats: NormalizeProductTitlesStats): NormalizeProductTitlesStats {
  const denominator = stats.uniqueTitles > 0 ? stats.uniqueTitles : 1;
  const fallbackRate = (stats.fallbackCount / denominator) * 100;
  return {
    ...stats,
    fallbackRatePct: Math.round(fallbackRate * 10) / 10,
  };
}

const GEMINI_PRIMARY_MODEL = 'gemini-3.1-flash-lite-preview';
const GEMINI_MODEL_CANDIDATES = Array.from(
  new Set(
    [process.env.GEMINI_MODEL, GEMINI_PRIMARY_MODEL]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value)),
  ),
);

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

const DEFAULT_MAX_TITLES_PER_BATCH = 15;
const MAX_TITLES_PER_BATCH = (() => {
  const parsed = Number(process.env.GEMINI_BATCH_SIZE ?? DEFAULT_MAX_TITLES_PER_BATCH);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_TITLES_PER_BATCH;
  return Math.max(5, Math.min(30, Math.trunc(parsed)));
})();
const DEFAULT_MAX_BATCHES_PER_REQUEST = 16;
const MAX_BATCHES_PER_REQUEST = (() => {
  const parsed = Number(process.env.GEMINI_MAX_BATCHES_PER_REQUEST ?? DEFAULT_MAX_BATCHES_PER_REQUEST);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_BATCHES_PER_REQUEST;
  return Math.max(1, Math.min(40, Math.trunc(parsed)));
})();
const DEFAULT_GEMINI_BATCH_CONCURRENCY = 2;
const GEMINI_BATCH_CONCURRENCY = (() => {
  const parsed = Number(process.env.GEMINI_BATCH_CONCURRENCY ?? DEFAULT_GEMINI_BATCH_CONCURRENCY);
  if (!Number.isFinite(parsed)) return DEFAULT_GEMINI_BATCH_CONCURRENCY;
  return Math.max(1, Math.min(4, Math.trunc(parsed)));
})();
const TITLE_DB_CHUNK_SIZE = 200;
const CACHE_MAX_ENTRIES = 10000;
const FALLBACK_CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_GEMINI_BATCH_TIMEOUT_MS = 3500;
const GEMINI_BATCH_TIMEOUT_MS = (() => {
  const parsed = Number(process.env.GEMINI_BATCH_TIMEOUT_MS ?? DEFAULT_GEMINI_BATCH_TIMEOUT_MS);
  if (!Number.isFinite(parsed) || parsed < 500) {
    return DEFAULT_GEMINI_BATCH_TIMEOUT_MS;
  }
  return Math.trunc(parsed);
})();
const GEMINI_RETRY_AFTER_QUOTA_MS = 60 * 1000;
const DB_CACHE_RETRY_AFTER_MS = 2 * 60 * 1000;

const normalizedTitlesCache = new Map<string, MemoryCacheEntry>();
let retryGeminiAfterMs = 0;
let dbCacheRetryAfterMs = 0;

const TITLE_STOPWORDS = new Set([
  'DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'Y', 'CON', 'PARA', 'POR',
  'UN', 'UNA', 'NO', 'INCLUYE', 'INCLUIR', 'SIN', 'EN', 'AL',
]);

const TITLE_NOISE_WORDS = new Set([
  'PROCESADOR', 'MICRO', 'CPU', 'PLACA', 'VIDEO', 'VGA',
  'MOTHERBOARD', 'MOTHER', 'MEMORIA', 'RAM',
  'GAMER', 'OFERTA', 'OEM', 'BOX',
  'NVIDIA', 'GEFORCE', 'RADEON', 'GRAPHICS', 'CARD',
  'EDITION', 'OC', 'PCI', 'PCIE', 'PCI-E', 'SERIES',
]);

const BRAND_PATTERN = /\b(ASUS|GIGABYTE|MSI|ZOTAC|PALIT|INNO3D|ASROCK|PNY|XFX|SAPPHIRE|AMD|INTEL|KINGSTON|CORSAIR|G\.?SKILL|TEAMGROUP|CRUCIAL|PATRIOT|ADATA|XPG|SAMSUNG|SEAGATE|WD)\b/;
const GPU_CHIP_PATTERN = /\b(RTX\s*\d{3,4}(?:\s*(?:TI|SUPER))?|GTX\s*\d{3,4}(?:\s*(?:TI|SUPER))?|RX\s*\d{3,4}(?:\s*XT)?|ARC\s*[A-Z]?\s*\d{3})\b/;
const CPU_CHIP_PATTERN = /\b(RYZEN\s*[3579]\s*\d{3,5}[A-Z0-9]{0,3}|CORE\s*I[3579]\s*\d{4,5}[A-Z]{0,2}|PENTIUM\s*[A-Z0-9]+|CELERON\s*[A-Z0-9]+)\b/;
const MEMORY_SIZE_PATTERN = /\b(\d{1,2}\s*G(?:B)?)\b/;
const SOCKET_PATTERN = /\b(AM[45]|LGA\s*\d{3,4})\b/;
const CHIPSET_PATTERN = /\b([ABHXZ]\d{3}[A-Z]{0,2})\b/;
const STORAGE_SIZE_PATTERN = /\b(\d+(?:\.\d+)?\s*(?:TB|GB))\b/;
const KNOWN_VARIANTS = [
  'DUAL', 'TUF', 'PRIME', 'EAGLE', 'WINDFORCE', 'VENTUS', 'SHADOW',
  'INFINITY', 'GAMING', 'AERO', 'STRIX', 'SUPRIM', 'TRINITY',
  'CHALLENGER', 'PULSE', 'NITRO', 'STEEL', 'TOMAHAWK',
];

function normalizeInputTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim();
}

function normalizeModelSpacing(value: string): string {
  return value
    .replace(/\b(RTX|GTX|RX)\s*(\d{3,4})(?:\s*(TI|SUPER|XT))?\b/gi, (_, chip, series, suffix) => {
      const suffixPart = suffix ? ` ${String(suffix).toUpperCase()}` : '';
      return `${String(chip).toUpperCase()} ${series}${suffixPart}`;
    })
    .replace(/\b(RYZEN)\s*([3579])\s*([0-9]{3,5}[A-Z0-9]{0,3})\b/gi, (_, brand, tier, model) =>
      `${String(brand).toUpperCase()} ${tier} ${String(model).toUpperCase()}`,
    )
    .replace(/\b(CORE)\s*I([3579])\s*([0-9]{4,5}[A-Z]{0,2})\b/gi, (_, core, tier, model) =>
      `${String(core).toUpperCase()} I${tier} ${String(model).toUpperCase()}`,
    )
    .replace(/\b(\d{1,2})\s*G\b/gi, '$1GB')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeForHeuristic(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9+ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanCapturedToken(token: string | undefined): string {
  return (token ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function normalizeMemorySize(token: string): string {
  if (!token) return '';
  const normalized = cleanCapturedToken(token);
  const digits = normalized.replace(/\D/g, '');
  if (!digits) return '';
  return `${digits}GB`;
}

function firstMatch(pattern: RegExp, input: string): string {
  const matched = input.match(pattern)?.[1];
  return cleanCapturedToken(matched);
}

function extractVariants(input: string): string[] {
  const wrapped = ` ${input} `;
  return KNOWN_VARIANTS.filter((variant) => wrapped.includes(` ${variant} `));
}

function dedupeTokens(tokens: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const cleaned = cleanCapturedToken(token);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    result.push(cleaned);
  }
  return result;
}

function buildHeuristicNormalizedTitle(rawTitle: string): string {
  const normalized = normalizeForHeuristic(rawTitle);
  if (!normalized) return rawTitle;

  const isBundle = /(^|\s)(COMBO|KIT|ARMADO|BUILD)(\s|$)/.test(normalized)
    || /\+/.test(normalized)
    || /(^|\s)PC(\s|$)/.test(normalized);
  const normalizedForPatterns = normalized.replace(/\+/g, ' ');

  const brand = firstMatch(BRAND_PATTERN, normalizedForPatterns);
  const gpuChip = firstMatch(GPU_CHIP_PATTERN, normalizedForPatterns);
  const cpuChip = firstMatch(CPU_CHIP_PATTERN, normalizedForPatterns);
  const memorySize = normalizeMemorySize(firstMatch(MEMORY_SIZE_PATTERN, normalizedForPatterns));
  const socket = firstMatch(SOCKET_PATTERN, normalizedForPatterns);
  const chipset = firstMatch(CHIPSET_PATTERN, normalizedForPatterns);
  const storageSize = firstMatch(STORAGE_SIZE_PATTERN, normalizedForPatterns);
  const variants = extractVariants(normalizedForPatterns);

  const structuredTokens = dedupeTokens([
    brand,
    gpuChip || cpuChip,
    ...variants.slice(0, 2),
    memorySize,
    socket,
    chipset,
    storageSize,
  ]);

  if (structuredTokens.length >= 2) {
    const canonicalStructured = structuredTokens.join(' ').trim();
    const normalizedStructured = normalizeModelSpacing(canonicalStructured);
    return isBundle ? `COMBO ${normalizedStructured}` : normalizedStructured;
  }

  const tokens = normalized
    .replace(/\+/g, ' + ')
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => token.length > 1)
    .filter((token) => !TITLE_STOPWORDS.has(token))
    .filter((token) => !TITLE_NOISE_WORDS.has(token));

  const uniqueSortedTokens = dedupeTokens(tokens).sort();
  const compact = uniqueSortedTokens.join(' ').trim();
  const canonical = normalizeModelSpacing(compact || normalized);
  return isBundle ? `COMBO ${canonical}` : canonical;
}

function normalizeOutputTitle(originalTitle: string, candidateTitle: string | undefined): string {
  const cleaned = (candidateTitle ?? '').replace(/\s+/g, ' ').trim();
  if (cleaned) return normalizeModelSpacing(cleaned);
  return normalizeModelSpacing(buildHeuristicNormalizedTitle(originalTitle));
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (items.length <= size) return [items];

  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

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

function isQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return normalized.includes('resource_exhausted') || normalized.includes('quota') || normalized.includes(' 429');
}

function isModelNotAvailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  return (
    normalized.includes('not found') ||
    normalized.includes('unsupported model') ||
    normalized.includes('unknown model') ||
    normalized.includes('invalid model') ||
    normalized.includes('http 404') ||
    normalized.includes('"code":404')
  );
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
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
      `[Gemini Normalizer] DB cache read unavailable, fallback to in-memory only for ${Math.round(DB_CACHE_RETRY_AFTER_MS / 1000)}s: ${formatError(error)}`,
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
      `[Gemini Normalizer] DB cache upsert unavailable, continuing with memory cache only for ${Math.round(DB_CACHE_RETRY_AFTER_MS / 1000)}s: ${formatError(error)}`,
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
