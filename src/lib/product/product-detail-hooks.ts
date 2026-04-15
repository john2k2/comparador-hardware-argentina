import { useEffect, useMemo, useState } from 'react';
import { computeComparableStorePriceStats } from '@/lib/price-utils';
import type { Product } from '@/lib/types';
import {
  normalizeFetchedProduct,
  resolveInitialProductClientState,
  setCachedProduct,
  writeStoredProduct,
} from './product-cache-utils';

const CLIENT_DETAIL_CACHE_TTL_MS = 5 * 60 * 1000;

const EMPTY_COMPARABLE_STATS = {
  comparablePrices: [],
  discardedPrices: [],
  lowest: 0,
  highest: 0,
  average: 0,
};

export function useProductDetailState(id: string, initialProduct: Product | null) {
  const initialClientState = useMemo(
    () => resolveInitialProductClientState(id, initialProduct),
    [id, initialProduct],
  );
  const [product, setProduct] = useState<Product | null>(initialClientState.product);
  const [isLoading, setIsLoading] = useState(initialClientState.isLoading);

  useEffect(() => {
    if (!initialClientState.shouldFetch) return;

    const controller = new AbortController();
    const shouldShowLoader = !initialClientState.product;

    const loadProduct = async () => {
      try {
        const res = await fetch(`/api/products?id=${encodeURIComponent(id)}`, {
          signal: controller.signal,
        });

        if (!res.ok) {
          if (shouldShowLoader) {
            const entry = {
              expiresAt: Date.now() + CLIENT_DETAIL_CACHE_TTL_MS,
              product: null,
            };
            setCachedProduct(id, null);
            writeStoredProduct(id, entry);
            setProduct(null);
          }
          return;
        }

        const fetched = normalizeFetchedProduct(await res.json() as Product);
        const entry = {
          expiresAt: Date.now() + CLIENT_DETAIL_CACHE_TTL_MS,
          product: fetched,
        };
        setCachedProduct(id, fetched);
        writeStoredProduct(id, entry);
        setProduct(fetched);
      } catch (error) {
        if ((error as Error).name !== 'AbortError' && shouldShowLoader) {
          setProduct(null);
        }
      } finally {
        if (!controller.signal.aborted && shouldShowLoader) {
          setIsLoading(false);
        }
      }
    };

    void loadProduct();
    return () => controller.abort();
  }, [id, initialClientState.product, initialClientState.shouldFetch]);

  const comparableStats = useMemo(
    () => (product ? computeComparableStorePriceStats(product.prices) : EMPTY_COMPARABLE_STATS),
    [product],
  );
  const merchantPrices = comparableStats.comparablePrices;
  const lowestComparablePrice = product
    ? (comparableStats.lowest > 0 ? comparableStats.lowest : product.lowestPrice)
    : 0;
  const highestComparablePrice = product
    ? (comparableStats.highest > 0 ? comparableStats.highest : product.highestPrice)
    : 0;
  const latestSyncAtMs = useMemo(
    () => merchantPrices.reduce((max, price) => {
      const timestamp = new Date(price.lastUpdated).getTime();
      if (!Number.isFinite(timestamp)) return max;
      return Math.max(max, timestamp);
    }, 0),
    [merchantPrices],
  );
  const latestSyncLabel = useMemo(() => {
    if (latestSyncAtMs <= 0) return null;

    // Formato deterministico usando UTC para evitar hydration mismatch
    // entre server (posiblemente UTC) y client (timezone local)
    const date = new Date(latestSyncAtMs);
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    return `${day}/${month} ${hours}:${minutes}`;
  }, [latestSyncAtMs]);

  return {
    product,
    isLoading,
    merchantPrices,
    lowestComparablePrice,
    highestComparablePrice,
    latestSyncLabel,
  };
}
