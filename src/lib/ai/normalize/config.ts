export const GEMINI_PRIMARY_MODEL = 'gemini-3.1-flash-lite-preview';
export const GEMINI_MODEL_CANDIDATES = Array.from(
  new Set(
    [process.env.GEMINI_MODEL, GEMINI_PRIMARY_MODEL]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value)),
  ),
);

export const DEFAULT_MAX_TITLES_PER_BATCH = 15;
export const MAX_TITLES_PER_BATCH = (() => {
  const parsed = Number(process.env.GEMINI_BATCH_SIZE ?? DEFAULT_MAX_TITLES_PER_BATCH);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_TITLES_PER_BATCH;
  return Math.max(5, Math.min(30, Math.trunc(parsed)));
})();
export const DEFAULT_MAX_BATCHES_PER_REQUEST = 16;
export const MAX_BATCHES_PER_REQUEST = (() => {
  const parsed = Number(process.env.GEMINI_MAX_BATCHES_PER_REQUEST ?? DEFAULT_MAX_BATCHES_PER_REQUEST);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_BATCHES_PER_REQUEST;
  return Math.max(1, Math.min(40, Math.trunc(parsed)));
})();
export const DEFAULT_GEMINI_BATCH_CONCURRENCY = 2;
export const GEMINI_BATCH_CONCURRENCY = (() => {
  const parsed = Number(process.env.GEMINI_BATCH_CONCURRENCY ?? DEFAULT_GEMINI_BATCH_CONCURRENCY);
  if (!Number.isFinite(parsed)) return DEFAULT_GEMINI_BATCH_CONCURRENCY;
  return Math.max(1, Math.min(4, Math.trunc(parsed)));
})();
export const TITLE_DB_CHUNK_SIZE = 200;
export const CACHE_MAX_ENTRIES = 10000;
export const FALLBACK_CACHE_TTL_MS = 10 * 60 * 1000;
export const DEFAULT_GEMINI_BATCH_TIMEOUT_MS = 3500;
export const GEMINI_BATCH_TIMEOUT_MS = (() => {
  const parsed = Number(process.env.GEMINI_BATCH_TIMEOUT_MS ?? DEFAULT_GEMINI_BATCH_TIMEOUT_MS);
  if (!Number.isFinite(parsed) || parsed < 500) {
    return DEFAULT_GEMINI_BATCH_TIMEOUT_MS;
  }
  return Math.trunc(parsed);
})();
export const GEMINI_RETRY_AFTER_QUOTA_MS = 60 * 1000;
export const DB_CACHE_RETRY_AFTER_MS = 2 * 60 * 1000;
