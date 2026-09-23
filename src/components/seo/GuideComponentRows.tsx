'use client';

import Link from 'next/link';
import { trackStoreClick } from '@/lib/analytics';
import { formatPriceARS } from '@/lib/price-utils';
import type { ResolvedGuideComponent } from '@/lib/seo/budget-guide-pricing';
import { GUIDE_SLOT_KEYS, GUIDE_SLOT_LABELS, type GuideSlotKey } from '@/lib/seo/budget-builder';

export function GuideComponentRows({
  slots,
  surface = 'budget_guide',
}: {
  slots: Record<GuideSlotKey, ResolvedGuideComponent>;
  surface?: 'budget_guide' | 'budget_builder';
}) {
  return (
    <div className="space-y-4">
      {GUIDE_SLOT_KEYS.map((key) => (
        <ComponentRow key={key} slotKey={key} label={GUIDE_SLOT_LABELS[key]} item={slots[key]} surface={surface} />
      ))}
    </div>
  );
}

function ComponentRow({
  label,
  slotKey,
  item,
  surface,
}: {
  label: string;
  slotKey: GuideSlotKey;
  item: ResolvedGuideComponent;
  surface: 'budget_guide' | 'budget_builder';
}) {
  const extraOffers = item.offers.slice(1, 3);
  const isCatalog = item.priceSource === 'catalog';
  const showPrice = isCatalog || item.price > 0;

  return (
    <div className={`border-2 p-4 flex flex-col md:flex-row md:items-center gap-4 ${isCatalog ? 'border-border' : 'border-dashed border-muted'}`}>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="text-[10px] text-muted-foreground">{label}</span>
          <span className={`text-[8px] uppercase font-bold px-2 py-1 border-2 ${isCatalog ? 'border-secondary text-secondary' : 'border-muted text-muted-foreground'}`}>
            {isCatalog ? (item.offers[0]?.stock === 'low-stock' ? 'STOCK BAJO REGISTRADO' : 'STOCK REGISTRADO') : 'SIN OFERTA REGISTRADA'}
          </span>
        </div>
        <h3 className="text-[12px] font-bold break-words">{item.name}</h3>
        <p className="text-[10px] text-muted-foreground mt-1">{item.description}</p>
        {isCatalog && item.bestStoreName && (
          <p className="text-[10px] uppercase text-accent font-bold mt-2 break-words">
            {`Menor precio registrado (orientativo): @${item.bestStoreName}`}
          </p>
        )}
        {extraOffers.length > 0 && (
          <p className="text-[10px] uppercase text-muted-foreground mt-1 break-words">
            {extraOffers.map((offer) => `@${offer.storeName} ${formatPriceARS(offer.price)}`).join(' · ')}
          </p>
        )}
      </div>
      <div className="text-left md:text-right shrink-0 min-w-0">
        <div className="text-[14px] sm:text-[16px] font-pixel text-primary break-words">
          {showPrice ? formatPriceARS(item.price) : 'Sin oferta'}
        </div>
        {isCatalog ? (
          <div className="text-[10px] text-muted-foreground">
            {item.storeCount === 1 ? '1 tienda con stock registrado' : `${item.storeCount} tiendas con stock registrado`}
          </div>
        ) : (
          <div className="text-[10px] uppercase text-muted-foreground">Estimado. No recomendar compra.</div>
        )}
        <div className="flex flex-col md:items-end gap-1 mt-1">
          {item.bestStoreUrl && (
            <a
              href={item.bestStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                const offer = item.offers[0];
                if (!offer || !item.productId) return;
                trackStoreClick({
                  productId: item.productId,
                  productName: item.name,
                  storeName: offer.storeName,
                  storeId: offer.storeId,
                  price: offer.price,
                  position: 1,
                  category: slotKey,
                  ctaId: 'guide_store_offer',
                  destinationUrl: offer.url,
                  surface,
                  linkType: 'organic',
                });
              }}
              className="inline-flex min-h-11 items-center text-[10px] text-secondary hover:underline"
            >
              Ver en tienda →
            </a>
          )}
          {item.productId && (
            <Link
              href={`/product/${item.productId}`}
              className="inline-flex min-h-11 items-center text-[10px] text-primary hover:underline"
            >
              Comparar tiendas →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
