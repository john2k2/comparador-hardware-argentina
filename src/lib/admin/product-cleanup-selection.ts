export const CLEANUP_REASON_NO_VALID_PRICE = 'Sin tiendas con precio válido';
export const CLEANUP_REASON_ZERO_AGGREGATE = 'Precio agregado en $0';

const UNNAMED_PRODUCT = 'Sin nombre';

export type GroupedProduct = {
  id: string;
  name: string | null;
};

export type ProductCleanupCandidate = {
  id: string;
  name: string;
  reason: string;
};

export type ProductsHealth = {
  totalProducts: number;
  withZeroPrice: number;
  withoutStores: number;
  withPrices: number;
  healthy: number;
};

type SelectionInput = {
  groupedProducts: GroupedProduct[];
  /** Ids with at least one store offer priced above zero. */
  pricedProductIds: string[];
  /** Ids whose aggregate lowest/highest price is zero. */
  zeroPriceProductIds: string[];
};

/**
 * Picks the grouped products that should stop being indexable.
 *
 * A product with no offer priced above zero is reported as such even when its
 * aggregate is also zero: the missing offer is the cause, the zero aggregate
 * only its symptom, so reporting both would double-count one broken product.
 */
export function selectProductsToDeindex(input: SelectionInput): ProductCleanupCandidate[] {
  const priced = new Set(input.pricedProductIds);
  const zeroAggregate = new Set(input.zeroPriceProductIds);
  const selected = new Map<string, ProductCleanupCandidate>();

  for (const product of input.groupedProducts) {
    if (selected.has(product.id)) continue;

    const reason = !priced.has(product.id)
      ? CLEANUP_REASON_NO_VALID_PRICE
      : zeroAggregate.has(product.id)
        ? CLEANUP_REASON_ZERO_AGGREGATE
        : null;

    if (!reason) continue;

    selected.set(product.id, {
      id: product.id,
      name: product.name || UNNAMED_PRODUCT,
      reason,
    });
  }

  return Array.from(selected.values());
}

export function summarizeProductsHealth(input: SelectionInput): ProductsHealth {
  const candidates = selectProductsToDeindex(input);
  const withoutStores = candidates
    .filter((entry) => entry.reason === CLEANUP_REASON_NO_VALID_PRICE).length;
  const withZeroPrice = candidates
    .filter((entry) => entry.reason === CLEANUP_REASON_ZERO_AGGREGATE).length;
  const uniqueIds = new Set(input.groupedProducts.map((product) => product.id));

  return {
    totalProducts: uniqueIds.size,
    withZeroPrice,
    withoutStores,
    withPrices: new Set(input.pricedProductIds).size,
    healthy: Math.max(0, uniqueIds.size - withoutStores - withZeroPrice),
  };
}
