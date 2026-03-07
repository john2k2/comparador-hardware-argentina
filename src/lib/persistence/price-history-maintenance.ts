import { getServerSupabaseServiceClient } from '@/lib/server/supabase-server';
import {
  getPriceHistoryRetentionIntervals,
  PRICE_HISTORY_RETENTION_POLICY,
} from './price-history-retention-policy';

export type PriceHistoryCleanupResult = {
  deletedRows: number;
  beforeRows: number;
  remainingRows: number;
  policy: {
    keepRawDays: number;
    keepHourlyDays: number;
    keepDailyDays: number;
  };
  executedAt: string;
};

export async function cleanupPriceHistory(): Promise<PriceHistoryCleanupResult> {
  const supabase = getServerSupabaseServiceClient();
  if (!supabase) {
    throw new Error('cleanupPriceHistory: Supabase service client unavailable');
  }

  const { data, error } = await supabase.rpc('cleanup_price_history', getPriceHistoryRetentionIntervals());
  if (error) {
    throw new Error(`cleanupPriceHistory: ${error.message}`);
  }

  const payload = data as Partial<PriceHistoryCleanupResult> | null;
  if (!payload || typeof payload !== 'object') {
    throw new Error('cleanupPriceHistory: invalid cleanup response');
  }

  return {
    deletedRows: Number(payload.deletedRows ?? 0),
    beforeRows: Number(payload.beforeRows ?? 0),
    remainingRows: Number(payload.remainingRows ?? 0),
    policy: {
      keepRawDays: Number(payload.policy?.keepRawDays ?? PRICE_HISTORY_RETENTION_POLICY.keepRawDays),
      keepHourlyDays: Number(payload.policy?.keepHourlyDays ?? PRICE_HISTORY_RETENTION_POLICY.keepHourlyDays),
      keepDailyDays: Number(payload.policy?.keepDailyDays ?? PRICE_HISTORY_RETENTION_POLICY.keepDailyDays),
    },
    executedAt: typeof payload.executedAt === 'string'
      ? payload.executedAt
      : new Date().toISOString(),
  };
}
