export const PRICE_HISTORY_RETENTION_POLICY = {
  keepRawDays: 14,
  keepHourlyDays: 90,
  keepDailyDays: 365,
} as const;

function intervalDays(days: number): string {
  return `${days} days`;
}

export function getPriceHistoryRetentionIntervals() {
  return {
    retain_recent: intervalDays(PRICE_HISTORY_RETENTION_POLICY.keepRawDays),
    retain_hourly: intervalDays(PRICE_HISTORY_RETENTION_POLICY.keepHourlyDays),
    retain_daily: intervalDays(PRICE_HISTORY_RETENTION_POLICY.keepDailyDays),
  };
}
