// Se aceptan agregados por producto y usuarios únicos, nunca sesiones ni IP.
export type CatalogInterest = { product_id: string; view_users: number; outbound_users: number;
  period_start: string; period_end: string; imported_at: string; expires_at: string };
export function parseCatalogInterest(payload: unknown, now = new Date()): CatalogInterest[] {
  if (!payload || typeof payload !== 'object') throw new Error('REFRESH_INVALID_INTEREST');
  const input = payload as { periodStart?: unknown; periodEnd?: unknown; products?: unknown };
  const day = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!day(input.periodStart) || !day(input.periodEnd)) throw new Error('REFRESH_INVALID_PERIOD');
  const start = input.periodStart as string, end = input.periodEnd as string;
  const days = (Date.parse(end) - Date.parse(start)) / 86400000;
  if (start < '2026-10-03' || days < 0 || days > 28 || end >= now.toISOString().slice(0,10)
    || Date.parse(end) < now.getTime() - 14 * 86400000) throw new Error('REFRESH_INVALID_PERIOD');
  if (!Array.isArray(input.products) || input.products.length > 1000) throw new Error('REFRESH_INVALID_INTEREST');
  const seen = new Set<string>();
  return input.products.map((value: unknown) => {
    const item = value as { productId?: unknown; viewUsers?: unknown; outboundUsers?: unknown };
    if (!item || typeof item.productId !== 'string' || !/^[\w.-]{1,240}$/.test(item.productId) || seen.has(item.productId)) throw new Error('REFRESH_INVALID_PRODUCT');
    if (![item.viewUsers,item.outboundUsers].every(count => typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 && count <= 10000000)) throw new Error('REFRESH_INVALID_COUNTS');
    seen.add(item.productId);
    return { product_id: item.productId, view_users: item.viewUsers as number, outbound_users: item.outboundUsers as number,
      period_start: start, period_end: end, imported_at: now.toISOString(), expires_at: new Date(now.getTime()+8*86400000).toISOString() };
  });
}
