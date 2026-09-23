'use client';

import { ExternalLink } from 'lucide-react';
import { PriceDisplay } from '@/components/functional';
import { cn } from '@/lib/utils';
import { normalizeDisplayText } from '@/lib/text-utils';
import { trackStoreClick } from '@/lib/analytics';
import { getOutboundStoreLinkType, getOutboundStoreRel } from '@/lib/commercial';
import type { ProductPrice, Product } from '@/lib/types';
import { needsIdentityReview } from '@/lib/quality/offer-identity';
import { getComparableStorePrices } from '@/lib/price-utils';
import { isOfferFresh } from '@/lib/price-freshness';

type StoresListProps = {
  product: Product;
  merchantPrices: ProductPrice[];
};

export function StoresList({ product, merchantPrices }: StoresListProps) {
  const bestOffer = getComparableStorePrices(
    merchantPrices.filter((price) => !needsIdentityReview(price, product) && (price.stock === 'in-stock' || price.stock === 'low-stock') && isOfferFresh(price.lastUpdated)),
  )[0];
  return (
    <div className="bg-card border-4 border-border p-4 md:p-6 pixel-shadow min-w-0">
      <h2 className="text-[12px] font-bold uppercase mb-4 text-accent border-b-4 border-accent inline-block pb-1">
        TIENDAS DISPONIBLES
      </h2>
      <div className="space-y-3">
        {merchantPrices.map((price, index) => {
          const linkType = getOutboundStoreLinkType(price.storeId);
          const isSponsored = linkType === 'sponsored';
          const pendingIdentity = needsIdentityReview(price, product);
          const isBest = price === bestOffer;
          const observedAt = new Date(price.lastUpdated);
          const fresh = isOfferFresh(price.lastUpdated);

          return (
            <div
              key={price.storeId}
              className={cn(
                'flex flex-col sm:flex-row sm:items-center justify-between p-3 border-2 gap-3',
                isBest
                  ? 'border-secondary bg-secondary/10'
                  : 'border-muted hover:border-border transition-colors',
              )}
            >
            <div className="flex flex-col gap-1">
              {isBest && (
                <span className="text-[8px] font-bold uppercase text-secondary">
                  [ MEJOR PRECIO ]
                </span>
              )}
              {isSponsored && (
                <span className="text-[8px] font-bold uppercase text-primary">
                  [ PATROCINADO ]
                </span>
              )}
              <span className="text-[10px] uppercase font-bold text-foreground">
                {`@${normalizeDisplayText(price.storeName)}`}
              </span>
              {pendingIdentity && (
                <p className="text-[9px] text-accent max-w-sm">
                  Identidad por corroborar. Confirmá la variante antes de comprar; esta oferta no se usa en presupuestos automáticos.
                </p>
              )}
              {!fresh && <p className="text-[9px] text-accent">PRECIO ANTERIOR · PENDIENTE DE ACTUALIZAR</p>}
              {Number.isFinite(observedAt.getTime()) && observedAt.getTime() > 0 && (
                <p className="text-[8px] text-foreground/70">
                  Precio relevado: {observedAt.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' })}
                </p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 justify-between sm:justify-end w-full sm:w-auto min-w-0">
              <PriceDisplay
                price={price.price}
                originalPrice={price.originalPrice}
                size="sm"
              />
              <a
                href={price.url}
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
                  'min-h-11 min-w-0 max-w-full px-3 py-2 text-[8px] uppercase font-bold transition-transform active:translate-x-1 active:translate-y-1 inline-flex items-center justify-center gap-2',
                  isBest
                    ? 'bg-secondary text-secondary-foreground'
                    : isSponsored
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground border-2 border-border',
                )}
              >
                <span className="sm:hidden">VER EN TIENDA</span>
                <span className="hidden sm:inline truncate">
                  {`VER EN ${normalizeDisplayText(price.storeName || price.storeId)}`}
                </span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
