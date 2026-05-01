import { getCacheMetrics, resetCacheMetrics } from '@/lib/server/shared-cache';
import { getServerSupabaseServiceClient } from '@/lib/server/supabase-server';

export type CacheHealthMetrics = {
  memory: {
    hits: number;
    misses: number;
    staleHits: number;
    hitRate: string;
    staleRate: string;
  };
  database: {
    hits: number;
    misses: number;
    hitRate: string;
  };
  cacheEntries: number;
  oldestEntry: string | null;
  newestEntry: string | null;
};

export async function getCacheHealthMetrics(): Promise<CacheHealthMetrics> {
  const metrics = getCacheMetrics();
  const totalMemory = metrics.hits + metrics.staleHits + metrics.misses;
  const totalDb = metrics.dbHits + metrics.dbMisses;
  
  const supabase = getServerSupabaseServiceClient();
  let cacheEntries = 0;
  let oldestEntry: string | null = null;
  let newestEntry: string | null = null;
  
  if (supabase) {
    try {
      const { count, error } = await supabase
        .from('api_cache_entries')
        .select('*', { count: 'exact', head: true });
      
      if (!error && count !== null) {
        cacheEntries = count;
      }
      
      // Get oldest and newest entries
      const { data: oldest } = await supabase
        .from('api_cache_entries')
        .select('updated_at')
        .order('updated_at', { ascending: true })
        .limit(1)
        .single();
        
      const { data: newest } = await supabase
        .from('api_cache_entries')
        .select('updated_at')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();
      
      oldestEntry = oldest?.updated_at ?? null;
      newestEntry = newest?.updated_at ?? null;
    } catch (error) {
      console.warn('[CacheHealth] Failed to fetch DB metrics:', error);
    }
  }
  
  return {
    memory: {
      hits: metrics.hits,
      misses: metrics.misses,
      staleHits: metrics.staleHits,
      hitRate: totalMemory > 0 ? `${((metrics.hits / totalMemory) * 100).toFixed(1)}%` : 'N/A',
      staleRate: totalMemory > 0 ? `${((metrics.staleHits / totalMemory) * 100).toFixed(1)}%` : 'N/A',
    },
    database: {
      hits: metrics.dbHits,
      misses: metrics.dbMisses,
      hitRate: totalDb > 0 ? `${((metrics.dbHits / totalDb) * 100).toFixed(1)}%` : 'N/A',
    },
    cacheEntries,
    oldestEntry,
    newestEntry,
  };
}

export { resetCacheMetrics };
