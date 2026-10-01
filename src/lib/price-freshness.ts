// El catálogo conserva referencias de 24 h; guías y armador exigen 3 h.
export const OFFER_FRESH_MS = 3 * 60 * 60 * 1000;
export const CATALOG_OFFER_FRESH_MS = 24 * 60 * 60 * 1000;

function withinWindow(observedAt: Date | string | number | null | undefined, now: number, windowMs: number): boolean {
  const timestamp = observedAt == null ? NaN : new Date(observedAt).getTime();
  return Number.isFinite(timestamp) && timestamp > 0
    && timestamp <= now + 60_000 && now - timestamp <= windowMs;
}
export function isOfferFresh(observedAt: Date | string | number | null | undefined, now = Date.now()): boolean {
  return withinWindow(observedAt, now, OFFER_FRESH_MS);
}
export function isCatalogOfferFresh(observedAt: Date | string | number | null | undefined, now = Date.now()): boolean {
  return withinWindow(observedAt, now, CATALOG_OFFER_FRESH_MS);
}
