'use client';

import { ExternalLink } from 'lucide-react';
import { PriceDisplay } from '@/components/functional';
import { cn } from '@/lib/utils';
import { normalizeDisplayText } from '@/lib/text-utils';
import { trackStoreClick } from '@/lib/analytics';
import { getOutboundStoreLinkType, getOutboundStoreRel } from '@/lib/commercial';
import type { ProductPrice, Product } from '@/lib/types';

type StoresListProps = {
  product: Product;
  merchantPrices: ProductPrice[];
};

export function StoresList({ product, merchantPrices }: StoresListProps) {
  return (
    <div className="bg-card border-4 border-border p-6 pixel-shadow">
      <h2 className="text-[12px] font-bold uppercase mb-4 text-accent border-b-4 border-accent inline-block pb-1">
        TIENDAS DISPONIBLES
      </h2>
      <div className="space-y-3">
        {merchantPrices.map((price, index) => {
          const linkType = getOutboundStoreLinkType(price.storeId);
          const isSponsored = linkType === 'sponsored';

          return (
            <div
              key={price.storeId}
              className={cn(
                'flex flex-col sm:flex-row sm:items-center justify-between p-3 border-2 gap-3',
                index === 0
                  ? 'border-secondary bg-secondary/10'
                  : 'border-muted hover:border-border transition-colors',
              )}
            >
            <div className="flex flex-col gap-1">
              {index === 0 && (
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
            </div>

            <div className="flex items-center gap-4 justify-between sm:justify-end w-full sm:w-auto">
              <PriceDisplay
                price={price.price}
                originalPrice={price.originalPrice}
                size="sm"
              />
              <a
                href={price.url}
                target="_blank"
                rel={getOutboundStoreRel(linkType)}
                aria-label={`Ver ${normalizeDisplayText(product.name)} en ${normalizeDisplayText(price.storeName || price.storeId)}`}
                onClick={() => {
                  trackStoreClick({
                    productId: product.id,
                    productName: product.name,
                    storeName: price.storeName || price.storeId,
                    storeId: price.storeId,
                    price: price.price,
                    position: index + 1,
                    surface: 'product_detail',
                    linkType,
                  });
                }}
                className={cn(
                  'min-h-11 px-3 py-2 text-[8px] uppercase font-bold transition-transform active:translate-x-1 active:translate-y-1 flex items-center justify-center gap-2',
                  index === 0
                    ? 'bg-secondary text-secondary-foreground'
                    : isSponsored
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground border-2 border-border',
                )}
              >
                {`VER EN ${normalizeDisplayText(price.storeName || price.storeId)}`} <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
