export const INDEXABLE_PRODUCT_ID_PREFIX = 'agrupado-';

export function isIndexableProductId(id: string): boolean {
  return id.startsWith(INDEXABLE_PRODUCT_ID_PREFIX);
}

export type ProductIndexDecision =
  | { status: 'not-found' }
  | { status: 'noindex'; reason: 'thin-offers' | 'canonical-duplicate' | 'not-grouped' }
  | { status: 'index' };

export function decideProductPageIndexing(input: {
  product: { id: string } | null;
  resolvedCanonicalId: string | null;
  comparableStoreCount: number;
}): ProductIndexDecision {
  if (!input.product) {
    return { status: 'not-found' };
  }

  if (!isIndexableProductId(input.product.id)) {
    return { status: 'noindex', reason: 'not-grouped' };
  }

  const canonicalId = input.resolvedCanonicalId ?? input.product.id;
  if (canonicalId !== input.product.id) {
    return { status: 'noindex', reason: 'canonical-duplicate' };
  }

  if (input.comparableStoreCount < 2) {
    return { status: 'noindex', reason: 'thin-offers' };
  }

  return { status: 'index' };
}
