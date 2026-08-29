export const STALE_PRODUCT_PRICE_POLICY = {
  productFreshWithinHours: 48,
  ghostPriceOlderThanDays: 14,
} as const;

export type ProductPriceIdentity = {
  product_id: string;
  store_id: string;
  url: string;
};

export type PersistedProductPrice = ProductPriceIdentity & {
  last_updated: string | null;
};

export type ProductFreshness = {
  id: string;
  last_scraped_at: string | null;
};

function pairKey(productId: string, storeId: string): string {
  return `${productId}\u0000${storeId}`;
}

function identityKey(row: ProductPriceIdentity): string {
  return `${row.product_id}\u0000${row.store_id}\u0000${row.url}`;
}

function toTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function selectStaleProductPricesToPrune(input: {
  persisted: PersistedProductPrice[];
  snapshot: ProductPriceIdentity[];
  products: ProductFreshness[];
  now?: Date;
}): ProductPriceIdentity[] {
  const nowMs = (input.now ?? new Date()).getTime();
  const freshMs = STALE_PRODUCT_PRICE_POLICY.productFreshWithinHours * 60 * 60 * 1000;
  const ghostMs = STALE_PRODUCT_PRICE_POLICY.ghostPriceOlderThanDays * 24 * 60 * 60 * 1000;

  const snapshotUrlsByPair = new Map<string, Set<string>>();
  const snapshotPairs = new Set<string>();
  for (const row of input.snapshot) {
    if (!row.product_id || !row.store_id || !row.url) continue;
    const pair = pairKey(row.product_id, row.store_id);
    snapshotPairs.add(pair);
    const urls = snapshotUrlsByPair.get(pair) ?? new Set<string>();
    urls.add(row.url);
    snapshotUrlsByPair.set(pair, urls);
  }

  const lastScrapedById = new Map(
    input.products.map((product) => [product.id, product.last_scraped_at]),
  );
  const selected = new Map<string, ProductPriceIdentity>();

  for (const row of input.persisted) {
    if (!row.product_id || !row.store_id || !row.url) continue;

    const identity: ProductPriceIdentity = {
      product_id: row.product_id,
      store_id: row.store_id,
      url: row.url,
    };
    const pair = pairKey(row.product_id, row.store_id);
    const snapshotUrls = snapshotUrlsByPair.get(pair);

    if (snapshotUrls && !snapshotUrls.has(row.url)) {
      selected.set(identityKey(identity), identity);
      continue;
    }

    if (snapshotPairs.has(pair)) {
      continue;
    }

    const scrapedAt = toTimestamp(lastScrapedById.get(row.product_id) ?? null);
    const updatedAt = toTimestamp(row.last_updated);
    if (scrapedAt === null || updatedAt === null) {
      continue;
    }

    const productIsFresh = nowMs - scrapedAt <= freshMs;
    const priceIsGhost = nowMs - updatedAt >= ghostMs;
    if (productIsFresh && priceIsGhost) {
      selected.set(identityKey(identity), identity);
    }
  }

  return Array.from(selected.values());
}
