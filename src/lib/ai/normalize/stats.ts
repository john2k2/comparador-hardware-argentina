import type { NormalizeProductTitlesStats } from './types';

export function createInitialStats(requestedTitles: number, uniqueTitles: number): NormalizeProductTitlesStats {
  return {
    requestedTitles,
    uniqueTitles,
    memoryHits: 0,
    dbHits: 0,
    heuristicCount: 0,
    fallbackCount: 0,
    deferredCount: 0,
    dbUpsertAttempted: 0,
    dbUpserted: 0,
    fallbackRatePct: 0,
    fallbackReasons: {
      heuristic: 0,
      deferred: 0,
      error: 0,
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
