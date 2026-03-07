import { getServerSupabaseServiceClient } from '@/lib/server/supabase-server';

type CacheEntry = {
  expiresAt: number;
  value: unknown;
};

const localCache = new Map<string, CacheEntry>();
const LOCAL_CACHE_MAX = 500;

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

export async function getSharedCache<T>(scope: string, key: string): Promise<T | undefined> {
  const scopedKey = buildScopedKey(scope, key);
  const now = Date.now();
  const local = localCache.get(scopedKey);
  if (local && local.expiresAt > now) {
    return local.value as T;
  }

  pruneLocalCache(now);

  const supabase = getServerSupabaseServiceClient();
  if (!supabase) return undefined;

  const { data, error } = await supabase
    .from('api_cache_entries')
    .select('payload,expires_at')
    .eq('cache_key', scopedKey)
    .maybeSingle();

  if (error || !data) return undefined;

  const expiresAtMs = new Date(String(data.expires_at)).getTime();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) {
    await supabase.from('api_cache_entries').delete().eq('cache_key', scopedKey);
    return undefined;
  }

  localCache.set(scopedKey, {
    value: data.payload,
    expiresAt: expiresAtMs,
  });

  return data.payload as T;
}

export async function setSharedCache<T>(scope: string, key: string, value: T, ttlMs: number): Promise<void> {
  const scopedKey = buildScopedKey(scope, key);
  const expiresAt = Date.now() + ttlMs;

  localCache.set(scopedKey, {
    value,
    expiresAt,
  });
  pruneLocalCache();

  const supabase = getServerSupabaseServiceClient();
  if (!supabase) return;

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
}

export async function deleteSharedCache(scope: string, key: string): Promise<void> {
  const scopedKey = buildScopedKey(scope, key);
  localCache.delete(scopedKey);

  const supabase = getServerSupabaseServiceClient();
  if (!supabase) return;

  await supabase.from('api_cache_entries').delete().eq('cache_key', scopedKey);
}

