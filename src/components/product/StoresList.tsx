'use client';

import { ExternalLink } from 'lucide-react';
import { PriceDisplay } from '@/components/functional';
import { cn } from '@/lib/utils';
import { normalizeDisplayText } from '@/lib/text-utils';
import { trackStoreClick } from '@/lib/analytics';
import { getOutboundStoreLinkType, getOutboundStoreRel } from '@/lib/commercial';
import type { ProductPrice, Product } from '@/lib/types';
import { needsIdentityReview } from '@/lib/quality/offer-identity';
import { getRecentProductOffers } from '@/lib/product/product-page-metadata';
import { listingReference } from '@/lib/scrapers/listing-reference';
import { isCatalogOfferFresh } from '@/lib/price-freshness';
import { OfferReportLink } from '@/components/commercial/OfferReportLink';

type StoresListProps = {
  product: Product;
  merchantPrices: ProductPrice[];
};

export function StoresList({ product, merchantPrices }: StoresListProps) {
  const bestOffer = getRecentProductOffers({ ...product, prices: merchantPrices })[0];
  return (
    <section id="ofertas-por-tienda" className="scroll-mt-24 bg-card border-[3px] border-border p-4 md:p-6 pixel-shadow min-w-0" aria-labelledby="store-offers-title">
      <h2 id="store-offers-title" className="text-base md:text-lg font-bold uppercase mb-4 text-accent">
        Ofertas por tienda
      </h2>
      {!merchantPrices.length && <p className="font-body text-base text-muted-foreground">No hay publicaciones con precio para mostrar en esta ficha. Esto no confirma que el producto esté agotado.</p>}
      <div className="space-y-3">
        {merchantPrices.map((price, index) => {
          const linkType = getOutboundStoreLinkType(price.storeId);
          const isSponsored = linkType === 'sponsored';
          const pendingIdentity = needsIdentityReview(price, product);
          const isBest = price === bestOffer;
          const observedAt = new Date(price.lastUpdated);
          const fresh = isCatalogOfferFresh(price.lastUpdated);
          const hasDestination = Boolean(price.url && listingReference(price.storeId, price.url));

          return (
            <div
              key={`${price.storeId}:${price.url}`}
              className={cn(
                'flex flex-col sm:flex-row sm:items-center justify-between p-3 border-2 gap-3',
                isBest
                  ? 'border-secondary bg-secondary/10'
                  : 'border-muted hover:border-border transition-colors',
              )}
            >
            <div className="flex flex-col gap-1">
              {isBest && (
                <span className="text-[12px] font-bold uppercase text-secondary">
                  [ MEJOR PRECIO ]
                </span>
              )}
              {isSponsored && (
                <span className="text-[12px] font-bold uppercase text-primary">
                  [ PATROCINADO ]
                </span>
              )}
              <span className="text-[12px] uppercase font-bold text-foreground">
                {`@${normalizeDisplayText(price.storeName)}`}
              </span>
              {pendingIdentity && (
                <p className="text-[12px] text-accent max-w-sm">
                  Identidad por corroborar. Confirmá la variante antes de comprar; esta oferta no se usa en presupuestos automáticos.
                </p>
              )}
              {!fresh && <p className="text-[12px] text-accent">PRECIO ANTERIOR · PENDIENTE DE ACTUALIZAR</p>}
              {price.priceCondition === 'special' && <p className="font-body text-sm text-muted-foreground">Precio especial: verificá el medio de pago.</p>}
              {Number.isFinite(observedAt.getTime()) && observedAt.getTime() > 0 && (
                <p className="text-[12px] text-foreground/70">
                  Precio relevado: {observedAt.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' })}
                </p>
              )}
            </div>

            <div className="flex flex-col items-stretch gap-2 w-full sm:w-auto sm:max-w-[20rem] min-w-0">
              <PriceDisplay
                price={price.price}
                originalPrice={price.originalPrice}
                size="md"
                isReference={!fresh || pendingIdentity || !hasDestination}
              />
              {hasDestination ? <a
                href={price.url}
                aria-label={`Ver en ${normalizeDisplayText(price.storeName || price.storeId)} (abre una pestaña nueva)`}
                target="_blank"
                rel={getOutboundStoreRel(linkType)}
                onClick={() => {
                  trackStoreClick({
                    productId: product.id,
                    productName: product.name,
                    storeName: price.storeName || price.storeId,
                    storeId: price.storeId,
                    price: price.price,
                    position: index + 1,
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
              <OfferReportLink context={{ productId: product.id, productName: product.name,
                storeId: price.storeId, storeName: price.storeName, offerUrl: price.url }} />
            </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
