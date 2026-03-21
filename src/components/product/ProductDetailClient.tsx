'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ProductCard } from '@/components/functional';
import { saveRecentlyViewedProduct } from '@/lib/client/recently-viewed';
import { computeComparableStorePriceStats } from '@/lib/price-utils';
import { normalizeDisplayText } from '@/lib/text-utils';
import type { Product } from '@/lib/types';
import { trackProductView } from '@/lib/analytics';
import {
  normalizeFetchedProduct,
  resolveBackHref,
  readStoredProduct,
  writeStoredProduct,
  setCachedProduct,
} from '@/lib/product/product-cache-utils';
import { ProductImage } from './ProductImage';
import { PriceSummary } from './PriceSummary';
import { StoresList } from './StoresList';
import { SpecsTable } from './SpecsTable';
import { ProductActions } from './ProductActions';

const CLIENT_DETAIL_CACHE_TTL_MS = 5 * 60 * 1000;

type ProductDetailClientProps = {
  id: string;
  initialProduct: Product | null;
};

export function ProductDetailClient({ id, initialProduct }: ProductDetailClientProps) {
  const searchParams = useSearchParams();
  const backHref = resolveBackHref(searchParams.get('from'));
  const normalizedInitialProduct = useMemo(
    () => (initialProduct ? normalizeFetchedProduct(initialProduct) : null),
    [initialProduct],
  );
  const [product, setProduct] = useState<Product | null>(normalizedInitialProduct);
  const [selectedInstallment, setSelectedInstallment] = useState<{
    count: number;
    amount: number;
    totalAmount: number;
    interest: boolean;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(!normalizedInitialProduct);
  const [latestSyncLabel, setLatestSyncLabel] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const cached = readStoredProduct(id);
    if (cached && cached.expiresAt > Date.now()) {
      setCachedProduct(id, cached.product);
      setProduct(cached.product);
      setIsLoading(false);
      return () => controller.abort();
    }

    const shouldShowLoader = !normalizedInitialProduct;
    if (shouldShowLoader) {
      setIsLoading(true);
    }

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
  }, [id, normalizedInitialProduct]);

  useEffect(() => {
    setProduct(normalizedInitialProduct);
    setIsLoading(!normalizedInitialProduct);
  }, [normalizedInitialProduct]);

  const comparableStats = useMemo(
    () => (product
      ? computeComparableStorePriceStats(product.prices)
      : {
          comparablePrices: [],
          discardedPrices: [],
          lowest: 0,
          highest: 0,
          average: 0,
        }),
    [product],
  );
  const merchantPrices = comparableStats.comparablePrices;

  useEffect(() => {
    if (!product) return;
    saveRecentlyViewedProduct(product);
    trackProductView({
      productId: product.id,
      productName: product.name,
      category: product.category,
      brand: product.brand,
      price: product.lowestPrice,
      storeCount: merchantPrices.length,
    });
  }, [product, merchantPrices.length]);
  const lowestComparablePrice = product
    ? (comparableStats.lowest > 0 ? comparableStats.lowest : product.lowestPrice)
    : 0;
  const highestComparablePrice = product
    ? (comparableStats.highest > 0 ? comparableStats.highest : product.highestPrice)
    : 0;
  const latestSyncAtMs = merchantPrices.reduce((max, price) => {
    const timestamp = new Date(price.lastUpdated).getTime();
    if (!Number.isFinite(timestamp)) return max;
    return Math.max(max, timestamp);
  }, 0);

  useEffect(() => {
    if (latestSyncAtMs <= 0) {
      setLatestSyncLabel(null);
      return;
    }

    setLatestSyncLabel(new Intl.DateTimeFormat('es-AR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(latestSyncAtMs)));
  }, [latestSyncAtMs]);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse space-y-8 bg-card border-4 border-border p-8 pixel-shadow">
          <div className="h-4 w-32 bg-muted mb-8" />
          <div className="grid lg:grid-cols-2 gap-8">
            <div className="aspect-square bg-muted border-4 border-border" />
            <div className="space-y-4">
              <div className="h-6 bg-muted w-3/4" />
              <div className="h-4 bg-muted w-1/2" />
              <div className="h-8 bg-muted w-1/3 mt-8" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <div className="bg-card border-4 border-primary p-8 max-w-lg mx-auto pixel-shadow-primary">
          <h1 className="text-xl font-bold text-primary mb-4 uppercase animate-pixel-blink">
            [ ERROR 404: ITEM NO ENCONTRADO ]
          </h1>
          <p className="text-[10px] text-muted-foreground uppercase mb-8">
            El item ha sido dropeado o ya no existe en la base de datos.
          </p>
          <Link href={backHref}>
            <button className="pixel-button">
              {`< VOLVER A LA BASE `}
            </button>
          </Link>
        </div>
      </div>
    );
  }

  const displayName = normalizeDisplayText(product.name);
  const displayBrand = normalizeDisplayText(product.brand);
  const displayModel = normalizeDisplayText(product.model);
  const displayDescription = normalizeDisplayText(product.description || product.name);

  const relatedProducts: Product[] = [];

  return (
    <div className="container mx-auto px-4 py-8">
      <nav className="mb-6">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-[10px] uppercase text-muted-foreground hover:text-primary transition-colors font-bold"
        >
          <ArrowLeft className="w-4 h-4" />
          [ VOLVER AL INVENTARIO ]
        </Link>
      </nav>

      <div className="grid lg:grid-cols-2 gap-8 mb-12">
        <div className="flex flex-col gap-6">
          <ProductImage
            image={product.image}
            productName={product.name}
            latestSyncLabel={latestSyncLabel}
          />

          <div className="bg-card border-4 border-border p-6 pixel-shadow">
            <p className="text-[10px] text-secondary font-bold uppercase tracking-widest mb-2">
              {`// BRAND: ${displayBrand}`}
            </p>
            <h1 className="text-xl md:text-2xl font-bold text-foreground uppercase leading-tight mb-2">
              {displayName}
            </h1>
            <p className="text-[8px] text-muted-foreground uppercase">
              MODELO: {displayModel}
            </p>
            <p className="text-[12px] md:text-[13px] text-foreground/85 mt-3 leading-relaxed normal-case tracking-normal font-mono">
              {displayDescription}
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <PriceSummary
            product={product}
            merchantPrices={merchantPrices}
            lowestComparablePrice={lowestComparablePrice}
            highestComparablePrice={highestComparablePrice}
            selectedInstallment={selectedInstallment}
            onSelectInstallment={setSelectedInstallment}
          />

          <SpecsTable product={product} />

          <StoresList product={product} merchantPrices={merchantPrices} />

          <ProductActions />
        </div>
      </div>

      {relatedProducts.length > 0 && (
        <section className="mt-16 border-t-4 border-muted pt-8">
          <h2 className="text-xl font-bold text-foreground mb-6 uppercase inline-block border-b-4 border-primary pb-2">
            ITEMS SIMILARES
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {relatedProducts.map((relatedProduct) => (
              <ProductCard key={relatedProduct.id} product={relatedProduct} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default ProductDetailClient;
