import type { NormalizeProductTitlesStats } from './types';

export function createInitialStats(requestedTitles: number, uniqueTitles: number): NormalizeProductTitlesStats {
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

export function finalizeStats(stats: NormalizeProductTitlesStats): NormalizeProductTitlesStats {
  const denominator = stats.uniqueTitles > 0 ? stats.uniqueTitles : 1;
  const fallbackRate = (stats.fallbackCount / denominator) * 100;
  return {
    ...stats,
    fallbackRatePct: Math.round(fallbackRate * 10) / 10,
  };
}
