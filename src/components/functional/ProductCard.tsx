// ============================================
// ProductCard - Version Pixel Art Retro
// ============================================

'use client';

import Image from 'next/image';
import Link from 'next/link';
import React, { useMemo } from 'react';
import { computeComparableStorePriceStats, formatPriceARS } from '@/lib/price-utils';
import { normalizeDisplayText } from '@/lib/text-utils';
import type { Product } from '@/lib/types';
import { cn } from '@/lib/utils';
import { PriceDisplay } from './PriceDisplay';
import { isImageHostWhitelisted } from '@/lib/whitelisted-hosts';

// Base64 encoded tiny placeholder for blur effect (1x1 pixel, light gray)
const BLUR_PLACEHOLDER = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAYAAAC09K7GAAAADklEQVQI12NgGAWjAAMAAMwIelQhR6EAAAAASUVORK5CYII=';

const SEARCH_SCROLL_STORAGE_PREFIX = 'search-scroll:v1:';
const PRICE_DROP_MIN_PERCENT = 5;
const PRICE_DROP_MIN_AMOUNT_ARS = 10_000;

function isWhitelisted(url: string): boolean {
  return isImageHostWhitelisted(url);
}

export interface ProductCardProps {
  product: Product;
  showStore?: boolean;
  className?: string;
  returnTo?: string | null;
}

function getPriceDropBaseline(product: Product, highestComparablePrice: number): number | null {
  let baseline = highestComparablePrice;

  for (const price of product.prices) {
    if (typeof price.originalPrice === 'number' && Number.isFinite(price.originalPrice)) {
      baseline = Math.max(baseline, price.originalPrice);
    }
  }

  if (!Number.isFinite(baseline) || baseline <= product.lowestPrice) {
    return null;
  }

  return baseline;
}

export const ProductCard = React.memo(function ProductCard({ product, showStore = true, className, returnTo = null }: ProductCardProps) {
  const comparableStats = useMemo(() => computeComparableStorePriceStats(product.prices), [product.prices]);
  const comparablePrices = comparableStats.comparablePrices;
  const comparableStoreCount = comparablePrices.length;
  const lowestComparablePrice = comparableStats.lowest > 0 ? comparableStats.lowest : product.lowestPrice;
  const highestComparablePrice = comparableStats.highest > 0 ? comparableStats.highest : product.highestPrice;
  const displayName = useMemo(() => normalizeDisplayText(product.name), [product.name]);
  const displayBrand = useMemo(() => normalizeDisplayText(product.brand), [product.brand]);

  const bestPrice = comparablePrices[0] ?? product.prices.find((price) => price.price === lowestComparablePrice);
  const hasDiscount = Boolean(bestPrice?.originalPrice && bestPrice.originalPrice > bestPrice.price);
  const discountPercent = hasDiscount
    ? Math.round((((bestPrice?.originalPrice ?? 0) - (bestPrice?.price ?? 0)) / (bestPrice?.originalPrice ?? 1)) * 100)
    : 0;
  const priceDropBaseline = getPriceDropBaseline(product, highestComparablePrice);
  const priceDropAmount = priceDropBaseline ? Math.max(0, priceDropBaseline - lowestComparablePrice) : 0;
  const priceDropPercent = priceDropBaseline ? Math.round((priceDropAmount / priceDropBaseline) * 100) : 0;
  const hasPriceDrop = Boolean(
    priceDropBaseline &&
    priceDropAmount > 0 &&
    (priceDropAmount >= PRICE_DROP_MIN_AMOUNT_ARS || priceDropPercent >= PRICE_DROP_MIN_PERCENT),
  );

  const productHref = returnTo
    ? `/product/${encodeURIComponent(product.id)}?from=${encodeURIComponent(returnTo)}`
    : `/product/${encodeURIComponent(product.id)}`;

  const handleClick = () => {
    if (!returnTo || typeof window === 'undefined') return;

    try {
      const payload = {
        y: Math.max(0, Math.round(window.scrollY || window.pageYOffset || 0)),
        savedAt: Date.now(),
      };
      window.sessionStorage.setItem(`${SEARCH_SCROLL_STORAGE_PREFIX}${returnTo}`, JSON.stringify(payload));
    } catch {
      // Ignore storage failures.
    }
  };

  return (
    <Link href={productHref} onClick={handleClick} className={cn('block group', className)}>
      <article className="h-full flex flex-col bg-card border-[3px] border-border p-3.5 pixel-shadow-primary transition-transform group-hover:-translate-y-1 group-hover:translate-x-1">
        <div className="relative aspect-square mb-3 border-2 border-border bg-background overflow-hidden">
          {product.image && isWhitelisted(product.image) ? (
            <Image
              src={product.image}
              alt={displayName}
              fill
              className="object-contain image-pixelated p-2 transition-transform duration-300 group-hover:scale-[1.03]"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              placeholder="blur"
              blurDataURL={BLUR_PLACEHOLDER}
            />
          ) : product.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.image}
              alt={displayName}
              className="object-contain image-pixelated p-2 w-full h-full transition-transform duration-300 group-hover:scale-[1.03]"
              onError={(event) => {
                (event.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <Image
              src="/pixel-box.svg"
              alt="No image"
              fill
              className="object-contain image-pixelated p-4 opacity-50"
              placeholder="blur"
              blurDataURL={BLUR_PLACEHOLDER}
            />
          )}

          {hasDiscount && (
            <div className="absolute top-0 right-0 bg-primary text-primary-foreground px-2 py-1 text-[8px] uppercase font-bold border-b-2 border-l-2 border-border animate-pulse">
              -{discountPercent}%
            </div>
          )}

          {comparableStoreCount > 1 && (
            <div className="absolute top-0 left-0 bg-secondary text-secondary-foreground px-2 py-1 text-[7px] uppercase font-bold border-b-2 border-r-2 border-border">
              COMPARADO
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-[8px] text-secondary uppercase tracking-widest font-bold truncate">
              {`// ${displayBrand}`}
            </p>
            <span className="text-[7px] uppercase text-muted-foreground tracking-wide shrink-0">
              {comparableStoreCount} STORES
            </span>
          </div>

          <h3 className="text-[11px] uppercase leading-snug line-clamp-3 min-h-[3.5rem] mb-2 text-foreground font-bold">
            {displayName}
          </h3>

          {hasPriceDrop && (
            <p className="text-[8px] uppercase text-primary font-bold mb-2">
              {`BAJO ${formatPriceARS(priceDropAmount)} (${priceDropPercent}%)`}
            </p>
          )}

          <div className="mt-auto pt-3 border-t-2 border-muted">
            <p className="text-[8px] uppercase text-muted-foreground mb-1">MEJOR PRECIO</p>
            <PriceDisplay
              price={lowestComparablePrice}
              originalPrice={hasDiscount ? bestPrice?.originalPrice : undefined}
              size="md"
            />
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-[8px] uppercase text-muted-foreground pt-2">
            {showStore && bestPrice ? (
              <span className="min-w-0 flex items-center gap-1 text-accent font-bold truncate">
                {`@${normalizeDisplayText(bestPrice.storeName)}`}
              </span>
            ) : <span />}
            <span className="shrink-0 whitespace-nowrap text-secondary font-bold tracking-wide border border-transparent px-1 py-0.5 transition-colors group-hover:border-border group-hover:bg-secondary group-hover:text-secondary-foreground">
              COMPARAR TIENDAS &gt;
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
});

export default ProductCard;
