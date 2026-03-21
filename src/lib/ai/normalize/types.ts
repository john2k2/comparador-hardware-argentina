export type NormalizationSource = 'gemini' | 'database' | 'fallback';
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

export type MemoryCacheEntry = {
  normalizedTitle: string;
  source: NormalizationSource;
  expiresAtMs: number | null;
};

export type NormalizationMapping = {
  originalTitle: string;
  standardTitle: string;
};

export type DbNormalizationRow = {
  raw_title: string;
  normalized_title: string;
};

export type NormalizeProductTitlesOptions = {
  useDatabaseCache?: boolean;
  queryContext?: string;
};
