export type HistoryPoint = {
  price: number;
  recordedAtMs: number;
};

export type CurrentPriceTime = {
  currentPrice: number;
  currentUpdatedAtMs: number;
};

const TRACKING_QUERY_KEYS = new Set([
  'fbclid', 'gclid', 'ref', 'source', 'utm_campaign', 'utm_content', 'utm_medium', 'utm_source', 'utm_term',
]);

export function normalizeOfferUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_QUERY_KEYS.has(key.toLowerCase())) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.toString().replace(/\/$/, '');
  } catch {
    return value.trim().replace(/\/$/, '');
  }
}

export function buildOfferIdentity(productId: string, storeId: string, offerUrl: string | null | undefined): string {
  const normalizedUrl = offerUrl ? normalizeOfferUrl(offerUrl) : '';
  return normalizedUrl ? `${productId}|${storeId}|${normalizedUrl}` : `${productId}|${storeId}`;
}

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
