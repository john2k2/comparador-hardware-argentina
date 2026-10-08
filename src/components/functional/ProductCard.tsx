// ============================================
// ProductCard - Version Pixel Art Retro
// ============================================

'use client';

import Link from 'next/link';
import React, { useMemo, useSyncExternalStore } from 'react';
import { trackProductSelection } from '@/lib/analytics';
import { computeComparableStorePriceStats, formatPriceARS, isComparableStoreOffer } from '@/lib/price-utils';
import { normalizeDisplayText } from '@/lib/text-utils';
import { freshnessLabel } from '@/lib/ui/freshness-label';
import { isCatalogOfferFresh } from '@/lib/price-freshness';
import type { Product } from '@/lib/types';
import { cn } from '@/lib/utils';
import { PriceDisplay } from './PriceDisplay';
import { ProductImageWithFallback } from './ProductImageWithFallback';
import { OfferReportLink } from '@/components/commercial/OfferReportLink';
import { getProductImageSource } from '@/lib/product-images';

const PRICE_DROP_MIN_PERCENT = 5;
const PRICE_DROP_MIN_AMOUNT_ARS = 10_000;

export interface ProductCardProps {
  product: Product;
  showStore?: boolean;
  className?: string;
  compact?: boolean;
  returnTo?: string | null;
  surface?: 'search_results' | 'home_featured' | 'home_latest_offers' | 'home_recent' | 'home_price_drop' | 'home_popular' | 'related_products' | 'store_landing';
  position?: number;
}

const subscribeNever = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

function compactAge(timestamp: number, nowMs = Date.now()): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 'SIN FECHA';
  const ageHours = Math.max(0, Math.floor((nowMs - timestamp) / 3_600_000));
  if (ageHours < 1) return 'HACE < 1 H';
  if (ageHours < 24) return `HACE ${ageHours} H`;
  return `HACE ${Math.floor(ageHours / 24)} D`;
}

function getPriceDropBaseline(bestPrice: Product['prices'][number] | undefined): number | null {
  const baseline = bestPrice?.originalPrice;
  if (!bestPrice || typeof baseline !== 'number' || !Number.isFinite(baseline) || baseline <= bestPrice.price) return null;
  return baseline;
}

export const ProductCard = React.memo(function ProductCard({
  product,
  showStore = true,
  className,
  compact = false,
  returnTo = null,
  surface,
  position,
}: ProductCardProps) {
  const {
    bestPrice,
    comparableStoreCount,
    displayBrand,
    displayName,
    discountPercent,
    freshStoreCount,
    hasDiscount,
    hasPriceDrop,
    hasFreshPrice,
    lowestComparablePrice,
    priceDropAmount,
    priceDropPercent,
  } = useMemo(() => {
    const eligible = product.prices.filter((price) => isComparableStoreOffer(price, product));
    const comparableStats = computeComparableStorePriceStats(eligible.filter((price) => !isCatalogOfferFresh(price.lastUpdated)));
    const freshStats = computeComparableStorePriceStats(eligible.filter((price) => isCatalogOfferFresh(price.lastUpdated)));
    const freshStoreCount = freshStats.comparablePrices.length;
    const hasFreshPrice = freshStoreCount > 0;
    const comparableStoreCount = new Set((hasFreshPrice ? freshStats : comparableStats).comparablePrices.map((price) => price.storeId)).size;
    const lowestComparablePrice = hasFreshPrice ? freshStats.lowest : comparableStats.lowest;
    const bestPrice = (hasFreshPrice ? freshStats : comparableStats).comparablePrices[0];
    const hasDiscount = Boolean(hasFreshPrice && bestPrice?.originalPrice && bestPrice.originalPrice > bestPrice.price);
    const discountPercent = hasDiscount
      ? Math.round((((bestPrice?.originalPrice ?? 0) - (bestPrice?.price ?? 0)) / (bestPrice?.originalPrice ?? 1)) * 100)
      : 0;
    // Solo se compara contra el precio anterior informado por la misma oferta.
    // Comparar tiendas distintas produciria una supuesta baja inexistente.
    const priceDropBaseline = getPriceDropBaseline(bestPrice);
    const priceDropAmount = priceDropBaseline ? Math.max(0, priceDropBaseline - lowestComparablePrice) : 0;
    const priceDropPercent = priceDropBaseline ? Math.round((priceDropAmount / priceDropBaseline) * 100) : 0;
    const hasPriceDrop = Boolean(
      hasFreshPrice && priceDropBaseline &&
      priceDropAmount > 0 &&
      (priceDropAmount >= PRICE_DROP_MIN_AMOUNT_ARS || priceDropPercent >= PRICE_DROP_MIN_PERCENT),
    );

    return {
      bestPrice,
      comparableStoreCount,
      displayBrand: normalizeDisplayText(product.brand),
      displayName: normalizeDisplayText(product.name),
      discountPercent,
      freshStoreCount,
      hasDiscount,
      hasPriceDrop,
      hasFreshPrice,
      lowestComparablePrice,
      priceDropAmount,
      priceDropPercent,
    };
  }, [product]);

  const productHref = returnTo
    ? `/product/${encodeURIComponent(product.id)}?from=${encodeURIComponent(returnTo)}`
    : `/product/${encodeURIComponent(product.id)}`;
  const hydrated = useSyncExternalStore(subscribeNever, getClientSnapshot, getServerSnapshot);
  const observedMs = bestPrice ? new Date(bestPrice.lastUpdated).getTime() : 0;
  const hasObservedDate = Number.isFinite(observedMs) && observedMs > 0;
  // La antigüedad relativa depende del reloj: se calcula después de hidratar para que servidor y cliente coincidan.
  const freshness = hydrated
    ? freshnessLabel(observedMs)
    : !hasObservedDate ? 'ACTUALIZACION NO DISPONIBLE' : hasFreshPrice ? 'RELEVADO EN LAS ÚLTIMAS 24 H' : 'RELEVADO HACE MÁS DE 24 H';
  const shortFreshness = hydrated ? compactAge(observedMs) : !hasObservedDate ? 'SIN FECHA' : hasFreshPrice ? '< 24 H' : '> 24 H';

  return (
    <div className={cn('flex h-full min-w-0 flex-col', className)}>
    <Link
      href={productHref}
      prefetch={false}
      className="block group flex-1 min-w-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-secondary"
      onClick={() => {
        if (!surface || !position) return;
        trackProductSelection({
          productId: product.id,
          productName: product.name,
          category: product.category,
          brand: product.brand,
          price: lowestComparablePrice,
          position,
          surface,
        });
      }}
    >
      <article className={cn('h-full bg-card border-[3px] border-border p-3.5 pixel-shadow-primary transition-transform motion-safe:group-hover:-translate-y-1 motion-safe:group-hover:translate-x-1',
        compact ? 'grid grid-cols-[80px_minmax(0,1fr)] sm:grid-cols-[120px_minmax(0,1fr)] gap-3' : 'flex flex-col')}>
        <div className={cn('relative border-2 border-border bg-background overflow-hidden', compact ? 'aspect-square self-start' : 'aspect-[4/3] sm:aspect-square max-h-56 mb-3')}>
          <ProductImageWithFallback
            src={getProductImageSource(product)}
            alt={displayName}
            eager={false}
            className="object-contain p-2 w-full h-full transition-transform duration-200 motion-safe:group-hover:scale-[1.03]"
            fallbackClassName="p-4 opacity-50 image-pixelated"
          />

          {hasDiscount && (
            <div className="absolute top-0 right-0 bg-primary text-primary-foreground px-2 py-1 text-[12px] uppercase font-bold border-b-2 border-l-2 border-border">
              -{discountPercent}%
            </div>
          )}

          {freshStoreCount > 1 && (
            <div className="absolute top-0 left-0 bg-secondary text-secondary-foreground px-2 py-1 text-[12px] uppercase font-bold border-b-2 border-r-2 border-border">
              COMPARADO
            </div>
          )}
          {hasPriceDrop && <p className="absolute bottom-0 inset-x-0 bg-primary text-primary-foreground px-2 py-1 text-sm font-bold line-clamp-2"
            title={`Descuento informado: ${formatPriceARS(priceDropAmount)} (${priceDropPercent}%)`}>
            {`Descuento informado: ${formatPriceARS(priceDropAmount)} (${priceDropPercent}%)`}
          </p>}
        </div>

        <div className="min-w-0 flex-1 flex flex-col font-mono">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-[12px] text-secondary uppercase tracking-normal font-bold truncate">
              {`// ${displayBrand}`}
            </p>
            <span className="text-[12px] uppercase text-foreground/75 tracking-wide shrink-0">
              {comparableStoreCount} {comparableStoreCount === 1 ? 'TIENDA' : 'TIENDAS'}
            </span>
          </div>

          <h3 className="font-body text-[15px] normal-case tracking-normal leading-snug line-clamp-3 h-[4.25rem] mb-2 text-foreground font-bold">
            {displayName}
          </h3>

          <div className="mt-auto pt-3 border-t-2 border-muted">
            {bestPrice ? (
              <>
                <p className="text-[12px] uppercase leading-snug text-foreground/80 mb-1 min-h-[2lh]">{hasFreshPrice ? 'MEJOR PRECIO REGISTRADO' : 'ÚLTIMO PRECIO RELEVADO · PENDIENTE DE ACTUALIZAR'}</p>
                <PriceDisplay
                  price={lowestComparablePrice}
                  originalPrice={hasDiscount ? bestPrice.originalPrice : undefined}
                  size="md"
                  isReference={!hasFreshPrice}
                  className="tabular-nums [&>div:last-child_span]:text-2xl [&>div:last-child_span]:leading-tight"
                />
                <p className="mt-1 flex min-w-0 items-baseline gap-1 text-[12px] uppercase text-foreground/75" title={freshness}>
                  {showStore && <>
                    <span className="min-w-0 truncate text-accent font-bold">{`@${normalizeDisplayText(bestPrice.storeName)}`}</span>
                    <span aria-hidden="true">·</span>
                  </>}
                  <time className="shrink-0" dateTime={hasObservedDate ? new Date(observedMs).toISOString() : undefined}>
                    <span className="sr-only">{freshness}</span>
                    <span aria-hidden="true">{shortFreshness}</span>
                  </time>
                </p>
              </>
            ) : (
              <p className="text-[12px] uppercase text-accent min-h-[2lh]">Sin oferta disponible para comparar</p>
            )}
          </div>

          <span className="mt-2 self-start max-w-full font-mono text-[12px] uppercase text-secondary font-bold tracking-normal border border-transparent px-1 py-0.5 transition-colors group-hover:border-secondary">
            {hasFreshPrice ? 'COMPARAR TIENDAS >' : 'VER FICHA Y REFERENCIAS >'}
          </span>
        </div>
      </article>
    </Link>
    <OfferReportLink className="self-end text-[11px] text-foreground/75 decoration-dotted" context={{ productId: product.id, productName: displayName,
      storeId: bestPrice?.storeId, storeName: bestPrice?.storeName, offerUrl: bestPrice?.url }} />
    </div>
  );
});

export default ProductCard;
