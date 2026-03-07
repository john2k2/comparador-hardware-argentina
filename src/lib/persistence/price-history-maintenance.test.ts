import { describe, expect, it } from 'vitest';
import {
  getPriceHistoryRetentionIntervals,
  PRICE_HISTORY_RETENTION_POLICY,
} from './price-history-retention-policy';

describe('price history maintenance', () => {
  it('exposes explicit retention intervals for the cleanup RPC', () => {
    expect(PRICE_HISTORY_RETENTION_POLICY).toEqual({
      keepRawDays: 14,
      keepHourlyDays: 90,
      keepDailyDays: 365,
    });

    expect(getPriceHistoryRetentionIntervals()).toEqual({
      retain_recent: '14 days',
      retain_hourly: '90 days',
      retain_daily: '365 days',
    });
  });
});
