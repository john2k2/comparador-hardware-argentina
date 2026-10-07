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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRowCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isExecutionTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;

  const match = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  // Date.parse normaliza algunos días imposibles: comprobar el calendario antes de interpretarlo.
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1]
    && Number.isFinite(Date.parse(value));
}

export async function cleanupPriceHistory(): Promise<PriceHistoryCleanupResult> {
  const supabase = getServerSupabaseServiceClient();
  if (!supabase) {
    throw new Error('cleanupPriceHistory: Supabase service client unavailable');
  }

  const { data, error } = await supabase.rpc('cleanup_price_history', getPriceHistoryRetentionIntervals());
  if (error) {
    throw new Error(`cleanupPriceHistory: ${error.message}`);
  }

  const payload: unknown = data;
  if (
    !isRecord(payload)
    || !isRowCount(payload.deletedRows)
    || !isRowCount(payload.beforeRows)
    || !isRowCount(payload.remainingRows)
    || !isRecord(payload.policy)
    || payload.policy.keepRawDays !== PRICE_HISTORY_RETENTION_POLICY.keepRawDays
    || payload.policy.keepHourlyDays !== PRICE_HISTORY_RETENTION_POLICY.keepHourlyDays
    || payload.policy.keepDailyDays !== PRICE_HISTORY_RETENTION_POLICY.keepDailyDays
    || !isExecutionTimestamp(payload.executedAt)
  ) {
    throw new Error('cleanupPriceHistory: invalid cleanup response');
  }

  return {
    deletedRows: payload.deletedRows,
    beforeRows: payload.beforeRows,
    remainingRows: payload.remainingRows,
    policy: {
      keepRawDays: payload.policy.keepRawDays,
      keepHourlyDays: payload.policy.keepHourlyDays,
      keepDailyDays: payload.policy.keepDailyDays,
    },
    executedAt: payload.executedAt,
  };
}
