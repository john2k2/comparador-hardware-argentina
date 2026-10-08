'use client';

import { ExternalLink } from 'lucide-react';
import { PriceDisplay } from '@/components/functional';
import { cn } from '@/lib/utils';
import { normalizeDisplayText } from '@/lib/text-utils';
import { trackStoreClick } from '@/lib/analytics';
import { getOutboundStoreLinkType, getOutboundStoreRel } from '@/lib/commercial';
import type { ProductPrice, Product } from '@/lib/types';
import { needsIdentityReview } from '@/lib/quality/offer-identity';
import { buildOfferPresentation } from '@/lib/product/offer-presentation';
import { listingReference } from '@/lib/scrapers/listing-reference';
import { isCatalogOfferFresh } from '@/lib/price-freshness';
import { OfferReportLink } from '@/components/commercial/OfferReportLink';

type StoresListProps = {
  product: Product;
  merchantPrices: ProductPrice[];
  now?: number;
};

function hasValidObservedDate(date: Date, now = Date.now()) {
  const timestamp = date.getTime();
  return Number.isFinite(timestamp) && timestamp > 0 && timestamp <= now + 60_000;
}

export function StoresList({ product, merchantPrices, now }: StoresListProps) {
  const { recentPrices, referencePrices, bestOffer } = buildOfferPresentation(product, merchantPrices, now);
  function renderOffers(prices: ProductPrice[], recent: boolean, offset = 0) {
    return <ul className="space-y-3">
        {prices.map((price, index) => {
          const linkType = getOutboundStoreLinkType(price.storeId);
          const isSponsored = linkType === 'sponsored';
          const pendingIdentity = needsIdentityReview(price, product);
          const isBest = price === bestOffer;
          const observedAt = new Date(price.lastUpdated);
          const fresh = isCatalogOfferFresh(price.lastUpdated, now);
          const hasDestination = Boolean(price.url && listingReference(price.storeId, price.url));
          const validPrice = Number.isFinite(price.price) && price.price > 0;
          const validDate = hasValidObservedDate(observedAt, now);
          const available = price.stock === 'in-stock' || price.stock === 'low-stock';

          const observedMs = observedAt.getTime();
          const hasObservedAt = Number.isFinite(observedMs) && observedMs > 0;
          const sameStoreRecent = recentPrices.some((offer) => offer.storeId.toLowerCase() === price.storeId.toLowerCase());
          const outsideRange = !recent && fresh && !pendingIdentity && hasDestination && available && validPrice;
          // Solo colapsan avisos que no cambian si el precio está vigente o es comparable.
          const auxiliaryNotices = [
            outsideRange && sameStoreRecent ? 'Otra publicación de la misma tienda; no participa del mínimo reciente.' : null,
          ].filter((notice): notice is string => Boolean(notice));
          const stockLabel = price.stock === 'in-stock' ? (recent ? 'Stock informado en las últimas 24 h' : 'Stock informado')
            : price.stock === 'low-stock' ? (recent ? 'Stock bajo informado en las últimas 24 h' : 'Stock bajo informado')
              : price.stock === 'out-of-stock' ? 'La tienda informó sin stock en este relevamiento.'
                : 'Stock sin confirmar.';

          return (
            <li
              key={`${price.storeId}:${price.url}`}
              data-store-id={price.storeId}
              className={cn(
                'grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center p-3 border-2 gap-x-4 gap-y-2',
                isBest
                  ? 'border-secondary bg-secondary/10'
                  : recent ? 'border-muted hover:border-border transition-colors' : 'border-muted bg-muted/30',
              )}
            >
            <div className="flex min-w-0 flex-col gap-1">
              {(isBest || isSponsored) && <p className="flex flex-wrap gap-x-2 text-[12px] font-bold uppercase">
                {isBest && <span className="text-secondary">[ MENOR PRECIO RECIENTE ]</span>}
                {isSponsored && <span className="text-primary">[ PATROCINADO ]</span>}
              </p>}
              <p className="text-[12px] uppercase font-bold text-foreground break-words">
                {`@${normalizeDisplayText(price.storeName)}`}
              </p>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-body text-sm text-foreground/80">
                <p className={available ? undefined : 'text-accent'}>{stockLabel}</p>
                {hasObservedAt && (
                  <p>
                    Precio relevado: <time dateTime={observedAt.toISOString()}>{observedAt.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' })}</time>
                  </p>
                )}
              </div>
              {pendingIdentity && (
                <p className="font-body text-sm text-accent max-w-prose">
                  Identidad por corroborar. Confirmá la variante antes de comprar; esta oferta no se usa en presupuestos automáticos.
                </p>
              )}
              {!fresh && <p className="font-body text-sm font-bold text-accent">{validDate ? 'PRECIO ANTERIOR · PENDIENTE DE ACTUALIZAR' : 'Fecha de relevamiento por corroborar'}</p>}
              {outsideRange && !sameStoreRecent && <p className="font-body text-sm text-accent">Precio por corroborar: fuera del rango comparable.</p>}
              {price.priceCondition === 'special' && <p className="font-body text-sm text-accent">Precio especial: verificá el medio de pago.</p>}
              {auxiliaryNotices.length > 0 && <details className="font-body text-sm">
                <summary className="min-h-11 inline-flex items-center cursor-pointer text-foreground/80 underline decoration-dotted underline-offset-4">
                  Ver avisos ({auxiliaryNotices.length})
                </summary>
                <ul className="mt-1 space-y-1 border-l-2 border-muted pl-3 text-foreground/80">
                  {auxiliaryNotices.map((notice) => <li key={notice}>{notice}</li>)}
                </ul>
              </details>}
            </div>

            <div className="flex flex-col items-stretch gap-2 w-full sm:w-auto sm:max-w-[20rem] min-w-0">
              {validPrice ? <PriceDisplay
                price={price.price}
                originalPrice={price.originalPrice}
                size="md"
                isReference={!recent}
                className="tabular-nums sm:items-end"
              /> : <p className="font-body text-sm text-accent">Precio por corroborar</p>}
              {hasDestination ? <a
                href={price.url}
                aria-label={`Ver en ${normalizeDisplayText(price.storeName || price.storeId)} (abre una pestaña nueva)`}
                target="_blank"
                rel={getOutboundStoreRel(linkType)}
                onClick={() => {
                  if (!validPrice) return;
                  trackStoreClick({
                    productId: product.id,
                    productName: product.name,
                    storeName: price.storeName || price.storeId,
                    storeId: price.storeId,
                    price: price.price,
                    position: offset + index + 1,
                    category: product.category,
                    ctaId: 'product_store_offer',
                    destinationUrl: price.url,
                    surface: 'product_detail',
                    linkType,
                  });
                }}
                className={cn(
                  'min-h-11 min-w-0 max-w-full px-3 py-2 text-[12px] uppercase font-bold transition-transform active:translate-x-1 active:translate-y-1 inline-flex items-center justify-center gap-2',
                  isBest
                    ? 'bg-secondary text-secondary-foreground'
                    : isSponsored
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground border-2 border-border',
                )}
              >
                <span>VER EN TIENDA</span>
                <ExternalLink className="w-4 h-4 shrink-0" aria-hidden="true" />
              </a> : <p className="font-body text-sm text-accent">Enlace por corroborar</p>}
              <OfferReportLink className="justify-center sm:justify-end text-[12px]" context={{ productId: product.id, productName: product.name,
                storeId: price.storeId, storeName: price.storeName, offerUrl: price.url }} />
            </div>
            </li>
          );
        })}
      </ul>;
  }
  return (
    <section id="ofertas-por-tienda" className="scroll-mt-24 bg-card border-[3px] border-border p-4 md:p-6 pixel-shadow min-w-0" aria-labelledby="store-offers-title">
      <h2 id="store-offers-title" className="text-base md:text-lg font-bold uppercase mb-4 text-accent">Ofertas por tienda</h2>
      {!merchantPrices.length && <p className="font-body text-base text-muted-foreground">No hay publicaciones con precio para mostrar en esta ficha. Esto no confirma que el producto esté agotado.</p>}
      {recentPrices.length > 0 && <section aria-label="Ofertas recientes comparables">
        <h3 className="mb-2 font-body text-base font-bold">Ofertas recientes para comparar ({recentPrices.length})</h3>
        <p className="mb-4 font-body text-sm text-muted-foreground">Ordenadas de menor a mayor precio. Relevadas en las últimas 24 h, con stock informado, identidad apta y enlace válido.</p>
        {renderOffers(recentPrices, true)}
      </section>}
      {referencePrices.length > 0 && <details open={recentPrices.length === 0} className="mt-4 border-t-2 border-border pt-4" data-testid="reference-offers">
        <summary className="min-h-11 cursor-pointer font-body text-base font-bold">Precios por confirmar ({referencePrices.length})</summary>
        <p className="mb-4 font-body text-sm text-muted-foreground">Son referencias anteriores o publicaciones con comprobaciones pendientes. No participan del menor precio reciente. Confirmá precio, stock, variante y medio de pago en la tienda.</p>
        {renderOffers(referencePrices, false, recentPrices.length)}
      </details>}
    </section>
  );
}
