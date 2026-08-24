export type HistoryPoint = {
  price: number;
  recordedAtMs: number;
};

export type CurrentPriceTime = {
  currentPrice: number;
  currentUpdatedAtMs: number;
};

export function resolveBaselineFromHistory(
  history: HistoryPoint[],
  current: CurrentPriceTime,
): number | null {
  for (const point of history) {
    const olderThanCurrent = point.recordedAtMs < current.currentUpdatedAtMs - 1000;
    if (olderThanCurrent && point.price > current.currentPrice) return point.price;
  }

  return null;
}
