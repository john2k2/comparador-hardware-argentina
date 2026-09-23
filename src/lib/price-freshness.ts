// Una oferta sólo entra en comparaciones y totales confirmados si fue
// observada recientemente. El valor anterior se conserva como referencia.
export const OFFER_FRESH_MS = 3 * 60 * 60 * 1000;

export function isOfferFresh(observedAt: Date | string | number | null | undefined, now = Date.now()): boolean {
  const timestamp = observedAt == null ? NaN : new Date(observedAt).getTime();
  return Number.isFinite(timestamp)
    && timestamp > 0
    && timestamp <= now + 60_000
    && now - timestamp <= OFFER_FRESH_MS;
}
