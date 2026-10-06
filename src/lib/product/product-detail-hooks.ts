import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildOfferPresentation } from './offer-presentation';
import { CATALOG_OFFER_FRESH_MS } from '@/lib/price-freshness';
import type { Product } from '@/lib/types';
import {
  normalizeFetchedProduct,
  resolveInitialProductClientState,
  setCachedProduct,
  writeStoredProduct,
} from './product-cache-utils';

const CLIENT_DETAIL_CACHE_TTL_MS = 5 * 60 * 1000;

export function useProductDetailState(id: string, initialProduct: Product | null, initialNow?: number) {
  const initialClientState = useMemo(
    () => resolveInitialProductClientState(id, initialProduct),
    [id, initialProduct],
  );
  const [product, setProduct] = useState<Product | null>(initialClientState.product);
  const [isLoading, setIsLoading] = useState(initialClientState.isLoading);
  const [now, setNow] = useState(() => initialNow ?? Date.now());

  useEffect(() => {
    // Vencer una oferta cambia su presentación, sin renovar fechas ni consultar tiendas.
    let timer: number | undefined;
    const updateClock = () => {
      window.clearTimeout(timer);
      const currentNow = Date.now();
      setNow(currentNow);
      const deadlines = (product?.prices ?? [])
        .map((offer) => new Date(offer.lastUpdated).getTime() + CATALOG_OFFER_FRESH_MS + 1)
        .filter((deadline) => Number.isFinite(deadline) && deadline > currentNow);
      if (deadlines.length) {
        timer = window.setTimeout(updateClock, Math.min(Math.min(...deadlines) - currentNow, CATALOG_OFFER_FRESH_MS));
      }
    };
    updateClock();
    window.addEventListener('focus', updateClock);
    document.addEventListener('visibilitychange', updateClock);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', updateClock);
      document.removeEventListener('visibilitychange', updateClock);
    };
  }, [product]);

  const reloadProduct = useCallback(async () => {
    const response = await fetch(`/api/products?id=${encodeURIComponent(id)}&preferDb=1`, { cache: 'no-store' });
    if (!response.ok) throw new Error('La actualización terminó, pero no pudimos cargar la ficha. Volvé a abrirla en unos minutos.');
    const fetched = normalizeFetchedProduct(await response.json() as Product);
    const entry = { expiresAt: Date.now() + CLIENT_DETAIL_CACHE_TTL_MS, product: fetched };
    setCachedProduct(id, fetched);
    writeStoredProduct(id, entry);
    setProduct(fetched);
  }, [id]);

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

  const presentation = useMemo(
    () => product ? buildOfferPresentation(product, product.prices, now) : null,
    [product, now],
  );
  // Las referencias deben llegar a la UI; los outliers se calculan sólo sobre ofertas elegibles recientes.
  const merchantPrices = useMemo(() => product?.prices ?? [], [product]);
  const lowestComparablePrice = presentation?.lowest ?? 0;
  const highestComparablePrice = presentation?.highest ?? 0;
  const latestSyncAtMs = useMemo(
    () => merchantPrices.reduce((max, price) => {
      const timestamp = new Date(price.lastUpdated).getTime();
      if (!Number.isFinite(timestamp)) return max;
      return Math.max(max, timestamp);
    }, 0),
    [merchantPrices],
  );
  return {
    product,
    isLoading,
    merchantPrices,
    lowestComparablePrice,
    highestComparablePrice,
    latestSyncAtMs,
    now,
    reloadProduct,
  };
}
