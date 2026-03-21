export {
  normalizeProductTitlesWithStats,
  normalizeProductTitles,
  upsertMemoryCache,
  readMemoryCache,
} from './normalize';

export type {
  NormalizeProductTitlesStats,
  NormalizeProductTitlesResult,
  NormalizationSource,
  NormalizationFallbackReason,
  NormalizationMapping,
  NormalizeProductTitlesOptions,
  MemoryCacheEntry,
  DbNormalizationRow,
} from './normalize';
