export type NormalizationSource = 'heuristic' | 'database' | 'memory';
export type NormalizationFallbackReason = 'heuristic' | 'deferred' | 'error';

export interface NormalizeProductTitlesStats {
  requestedTitles: number;
  uniqueTitles: number;
  memoryHits: number;
  dbHits: number;
  heuristicCount: number;
  fallbackCount: number;
  deferredCount: number;
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
