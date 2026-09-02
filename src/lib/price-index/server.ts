import 'server-only';

import { logger } from '@/lib/logger';
import { getServerSupabaseServiceClient } from '@/lib/server/supabase-server';
import { getSharedCache, setSharedCache } from '@/lib/server/shared-cache';
import {
  buildPriceIndexSnapshot,
  createEmptyPriceIndexSnapshot,
  normalizePriceIndexDays,
  type PriceIndexRpcRow,
  type PriceIndexSnapshot,
} from './model';

export const PRICE_INDEX_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_SCOPE = 'price-index';

export async function getHardwarePriceIndex(days = 90): Promise<PriceIndexSnapshot> {
  const normalizedDays = normalizePriceIndexDays(days);
  const cacheKey = `v1:${normalizedDays}`;
  const cached = await getSharedCache<PriceIndexSnapshot>(CACHE_SCOPE, cacheKey);
  if (cached) return cached;

  const supabase = getServerSupabaseServiceClient();
  if (!supabase) {
    logger.warn('No se pudo cargar el indice de precios de hardware', { reason: 'service-client-unavailable' });
    return createEmptyPriceIndexSnapshot();
  }

  try {
    const { data, error } = await supabase.rpc('hardware_price_index', { p_days: normalizedDays });
    if (error) throw error;

    const snapshot = buildPriceIndexSnapshot(data as PriceIndexRpcRow[] | null);
    if (snapshot.status === 'ready') {
      await setSharedCache(CACHE_SCOPE, cacheKey, snapshot, PRICE_INDEX_CACHE_TTL_MS);
    }
    return snapshot;
  } catch (error) {
    logger.warn('No se pudo cargar el indice de precios de hardware', { error });
    return createEmptyPriceIndexSnapshot();
  }
}
