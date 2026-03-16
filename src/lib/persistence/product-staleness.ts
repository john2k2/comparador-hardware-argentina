import type { Product } from '@/lib/types';

export function isProductStale(product: Product, staleAfterMs: number, nowMs = Date.now()): boolean {
  const updatedAtMs = product.updatedAt?.getTime?.();
  if (typeof updatedAtMs !== 'number' || !Number.isFinite(updatedAtMs)) return true;
  return nowMs - updatedAtMs > staleAfterMs;
}

export function hasStaleProducts(products: Product[], staleAfterMs: number): boolean {
  if (products.length === 0) return false;
  const nowMs = Date.now();
  return products.some((product) => isProductStale(product, staleAfterMs, nowMs));
}
