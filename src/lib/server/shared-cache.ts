import { getServerSupabaseServiceClient } from '@/lib/server/supabase-server';
import { getRedisCache, setRedisCache, isRedisEnabled } from '@/lib/server/redis-cache';

type CacheEntry = {
  value: unknown;
  expiresAt: number;
  staleAt: number; // Stale-while-revalidate: serve stale, refresh in background
};

type CacheMetrics = {
  hits: number;
  misses: number;
  staleHits: number;
  redisHits: number;
  redisMisses: number;
  dbHits: number;
  dbMisses: number;
};

const localCache = new Map<string, CacheEntry>();
const LOCAL_CACHE_MAX = 500;

// Cache metrics for monitoring
const metrics: CacheMetrics = {
  hits: 0,
  misses: 0,
  staleHits: 0,
  redisHits: 0,
  redisMisses: 0,
  dbHits: 0,
  dbMisses: 0,
};

function buildScopedKey(scope: string, key: string): string {
  return `${scope}:${key}`;
}

function pruneLocalCache(now = Date.now()): void {
  for (const [key, entry] of localCache.entries()) {
    if (entry.expiresAt <= now) {
      localCache.delete(key);
    }
  }

  while (localCache.size > LOCAL_CACHE_MAX) {
    const oldestKey = localCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    localCache.delete(oldestKey);
  }
}

export function getCacheMetrics(): CacheMetrics {
  return { ...metrics };
}

export function resetCacheMetrics(): void {
  metrics.hits = 0;
  metrics.misses = 0;
  metrics.staleHits = 0;
  metrics.dbHits = 0;
  metrics.dbMisses = 0;
}

/**
 * Get value from cache with stale-while-revalidate support.
 * Returns stale data immediately while refreshing in background.
 */
export async function getSharedCache<T>(
  scope: string, 
  key: string,
  options?: { 
    allowStale?: boolean; // Serve stale data while refreshing (default: true)
    revalidateCallback?: () => Promise<T>; // Callback to refresh stale data
  }
): Promise<T | undefined> {
  const scopedKey = buildScopedKey(scope, key);
  const now = Date.now();
  const local = localCache.get(scopedKey);
  
  // Fresh cache hit
  if (local && local.staleAt > now) {
    metrics.hits++;
    return local.value as T;
  }
  
  // Stale cache hit - serve immediately, refresh in background
  if (local && local.expiresAt > now) {
    metrics.staleHits++;
    
    // Trigger background revalidation if callback provided
    if (options?.allowStale !== false && options?.revalidateCallback) {
      void (async () => {
        try {
          const freshValue = await options.revalidateCallback!();
          await setSharedCache(scope, key, freshValue, local.expiresAt - local.staleAt);
        } catch (error) {
          console.warn('[SharedCache] Background revalidation failed:', error);
        }
      })();
    }
    
    return local.value as T;
  }

  pruneLocalCache(now);
  metrics.misses++;

  // Try Redis cache (distributed, survives deploys)
  if (isRedisEnabled()) {
    try {
      const redisValue = await getRedisCache<T>(scopedKey);
      if (redisValue !== null) {
        metrics.redisHits++;
        // Store in local cache for faster subsequent access
        const ttl = 60 * 1000; // 1 minute in local cache
        localCache.set(scopedKey, {
          value: redisValue,
          expiresAt: now + ttl,
          staleAt: now + (ttl * 0.8),
        });
        return redisValue;
      }
    } catch (error) {
      console.warn('[SharedCache] Redis get failed:', error);
    }
    metrics.redisMisses++;
  }

  // Try database cache
  const supabase = getServerSupabaseServiceClient();
  if (!supabase) return undefined;

  const { data, error } = await supabase
    .from('api_cache_entries')
    .select('payload,expires_at')
    .eq('cache_key', scopedKey)
    .maybeSingle();

  if (error || !data) {
    metrics.dbMisses++;
    return undefined;
  }

  const expiresAtMs = new Date(String(data.expires_at)).getTime();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) {
    metrics.dbMisses++;
    await supabase.from('api_cache_entries').delete().eq('cache_key', scopedKey);
    return undefined;
  }

  metrics.dbHits++;
  
  // Store in local cache with 80% of remaining time as stale window
  const remainingTtl = expiresAtMs - now;
  const staleAt = now + (remainingTtl * 0.8);
  
  localCache.set(scopedKey, {
    value: data.payload,
    expiresAt: expiresAtMs,
    staleAt,
  });

  return data.payload as T;
}

/**
 * Set value in cache with TTL.
 * Uses stale-while-revalidate: 80% of TTL is fresh, last 20% is stale (served while refreshing).
 */
export async function setSharedCache<T>(
  scope: string, 
  key: string, 
  value: T, 
  ttlMs: number,
  options?: {
    skipDbWrite?: boolean; // Skip DB write, cache in memory only (default: false)
  }
): Promise<void> {
  const scopedKey = buildScopedKey(scope, key);
  const now = Date.now();
  const expiresAt = now + ttlMs;
  const staleAt = now + (ttlMs * 0.8); // 80% fresh, 20% stale window

  localCache.set(scopedKey, {
    value,
    expiresAt,
    staleAt,
  });
  pruneLocalCache();

  // Write to Redis (distributed cache)
  if (isRedisEnabled()) {
    try {
      await setRedisCache(scopedKey, value, Math.ceil(ttlMs / 1000));
    } catch (error) {
      console.warn('[SharedCache] Redis set failed:', error);
    }
  }

  // Skip DB write for ultra-fast local-only cache
  if (options?.skipDbWrite) return;

  const supabase = getServerSupabaseServiceClient();
  if (!supabase) return;

  // Fire-and-forget — no bloquear la respuesta en la escritura a Supabase.
  // El cache local ya sirve la siguiente request.
  void (async () => {
    try {
      await supabase
        .from('api_cache_entries')
        .upsert({
          cache_key: scopedKey,
          scope,
          payload: value,
          expires_at: new Date(expiresAt).toISOString(),
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'cache_key',
        });
    } catch (dbError) {
      // Fallos de cache persistente son no-críticos; el cache local sigue funcionando.
      console.warn('[SharedCache] DB upsert failed (non-critical):', dbError);
    }
  })();
}

/**
 * Preload/warm cache with multiple values.
 * Useful for warming cache after deploy or on startup.
 */
export async function preloadCache(
  entries: Array<{ scope: string; key: string; value: unknown; ttlMs: number }>
): Promise<void> {
  const now = Date.now();
  
  for (const entry of entries) {
    const scopedKey = buildScopedKey(entry.scope, entry.key);
    const expiresAt = now + entry.ttlMs;
    const staleAt = now + (entry.ttlMs * 0.8);
    
    localCache.set(scopedKey, {
      value: entry.value,
      expiresAt,
      staleAt,
    });
  }
  
  pruneLocalCache(now);
  
  // Bulk insert to DB in background
  const supabase = getServerSupabaseServiceClient();
  if (!supabase) return;
  
  void (async () => {
    try {
      const dbEntries = entries.map((entry) => ({
        cache_key: buildScopedKey(entry.scope, entry.key),
        scope: entry.scope,
        payload: entry.value,
        expires_at: new Date(now + entry.ttlMs).toISOString(),
        updated_at: new Date().toISOString(),
      }));
      
      await supabase
        .from('api_cache_entries')
        .upsert(dbEntries, {
          onConflict: 'cache_key',
        });
    } catch (dbError) {
      console.warn('[SharedCache] Bulk DB upsert failed (non-critical):', dbError);
    }
  })();
}

export async function deleteSharedCache(scope: string, key: string): Promise<void> {
  const scopedKey = buildScopedKey(scope, key);
  localCache.delete(scopedKey);

  // Delete from Redis
  if (isRedisEnabled()) {
    try {
      const { deleteRedisCache } = await import('@/lib/server/redis-cache');
      await deleteRedisCache(scopedKey);
    } catch (error) {
      console.warn('[SharedCache] Redis delete failed:', error);
    }
  }

  const supabase = getServerSupabaseServiceClient();
  if (!supabase) return;

  await supabase.from('api_cache_entries').delete().eq('cache_key', scopedKey);
}

/**
 * Clear all cache entries for a scope.
 */
export async function clearScopeCache(scope: string): Promise<void> {
  // Clear local cache
  for (const [key] of localCache.entries()) {
    if (key.startsWith(`${scope}:`)) {
      localCache.delete(key);
    }
  }

  // Clear Redis cache
  if (isRedisEnabled()) {
    try {
      const { deleteRedisPattern } = await import('@/lib/server/redis-cache');
      await deleteRedisPattern(`${scope}:*`);
    } catch (error) {
      console.warn('[SharedCache] Redis clear scope failed:', error);
    }
  }

  const supabase = getServerSupabaseServiceClient();
  if (!supabase) return;

  await supabase
    .from('api_cache_entries')
    .delete()
    .like('cache_key', `${scope}:%`);
}
