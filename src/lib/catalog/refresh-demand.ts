import type { HardwareCategory } from '@/lib/types';
import { isHardwareCategory } from '@/lib/catalog/hardware-categories';
import { getServerSupabaseServiceClient } from '@/lib/server/supabase-server';
import { logger } from '@/lib/logger';

export const CATALOG_REFRESH_DEMAND_SCOPE = 'catalog-refresh-demand';
const DEMAND_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_DEMAND_QUERY_LENGTH = 120;

export type CatalogRefreshDemand = {
  cacheKey: string;
  query?: string;
  category?: HardwareCategory;
  requestCount: number;
  lastRequestedAt: string;
};

type DemandPayload = Omit<CatalogRefreshDemand, 'cacheKey'>;

function normalizeQuery(query?: string): string | undefined {
  const normalized = query
    ?.replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_DEMAND_QUERY_LENGTH);
  return normalized || undefined;
}

function buildDemandKey(query?: string, category?: HardwareCategory): string | null {
  if (!query && !category) return null;
  return `${CATALOG_REFRESH_DEMAND_SCOPE}:${category ?? 'all'}:${encodeURIComponent((query ?? '').toLowerCase())}`;
}

function toDemand(payload: unknown, cacheKey: string): CatalogRefreshDemand | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Partial<DemandPayload>;
  const query = normalizeQuery(record.query);
  const category = isHardwareCategory(record.category) ? record.category : undefined;
  if (!query && !category) return null;

  return {
    cacheKey,
    query,
    category,
    requestCount: Number.isFinite(record.requestCount) ? Math.max(1, Math.floor(Number(record.requestCount))) : 1,
    lastRequestedAt: typeof record.lastRequestedAt === 'string' ? record.lastRequestedAt : new Date(0).toISOString(),
  };
}

/** Registra intención agregada para que el cron priorice lo que la gente busca. */
export async function recordCatalogRefreshDemand(input: {
  query?: string;
  category?: HardwareCategory;
}): Promise<void> {
  const query = normalizeQuery(input.query);
  const cacheKey = buildDemandKey(query, input.category);
  if (!cacheKey) return;

  const supabase = getServerSupabaseServiceClient();
  if (!supabase) return;

  const { data: existing, error: readError } = await supabase
    .from('api_cache_entries')
    .select('payload')
    .eq('cache_key', cacheKey)
    .maybeSingle();

  if (readError) {
    logger.warn('Catalog refresh demand read skipped', {
      endpoint: '/api/catalog-refresh-demand',
      error: readError.message,
    });
    return;
  }

  const previous = toDemand(existing?.payload, cacheKey);
  const now = new Date();
  const payload: DemandPayload = {
    query,
    category: input.category,
    requestCount: Math.min(100, (previous?.requestCount ?? 0) + 1),
    lastRequestedAt: now.toISOString(),
  };

  const { error: writeError } = await supabase
    .from('api_cache_entries')
    .upsert({
      cache_key: cacheKey,
      scope: CATALOG_REFRESH_DEMAND_SCOPE,
      payload,
      expires_at: new Date(now.getTime() + DEMAND_TTL_MS).toISOString(),
      updated_at: now.toISOString(),
    }, { onConflict: 'cache_key' });

  if (writeError) {
    logger.warn('Catalog refresh demand write skipped', {
      endpoint: '/api/catalog-refresh-demand',
      error: writeError.message,
    });
  }
}

export async function loadCatalogRefreshDemands(limit: number): Promise<CatalogRefreshDemand[] | null> {
  const supabase = getServerSupabaseServiceClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('api_cache_entries')
    .select('cache_key,payload')
    .eq('scope', CATALOG_REFRESH_DEMAND_SCOPE)
    .gt('expires_at', new Date().toISOString())
    .order('updated_at', { ascending: false })
    .limit(Math.max(limit * 4, 20));

  if (error) {
    logger.warn('Catalog refresh demand load skipped', {
      endpoint: '/api/admin/catalog-refresh',
      error: error.message,
    });
    return null;
  }

  return (data ?? [])
    .map((row) => toDemand(row.payload, String(row.cache_key ?? '')))
    .filter((demand): demand is CatalogRefreshDemand => Boolean(demand))
    .sort((first, second) => {
      if (second.requestCount !== first.requestCount) return second.requestCount - first.requestCount;
      return new Date(second.lastRequestedAt).getTime() - new Date(first.lastRequestedAt).getTime();
    })
    .slice(0, limit);
}
