'use client';

import Link from 'next/link';
import { trackStoreClick } from '@/lib/analytics';
import { formatPriceARS } from '@/lib/price-utils';
import type { GuideReferenceOffer, ResolvedGuideComponent } from '@/lib/seo/budget-guide-pricing';
import { GUIDE_SLOT_KEYS, GUIDE_SLOT_LABELS, type GuideSlotKey } from '@/lib/seo/budget-builder';
import { OfferReportLink } from '@/components/commercial/OfferReportLink';

function observationDate(value?: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'fecha no disponible';
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(value)) + ' (Argentina)';
}

export function GuideComponentRows({
  slots,
  references = {},
  surface = 'budget_guide',
  buyableOnly = false,
}: {
  slots: Record<GuideSlotKey, ResolvedGuideComponent>;
  references?: Partial<Record<GuideSlotKey, GuideReferenceOffer | null>>;
  surface?: 'budget_guide' | 'budget_builder';
  buyableOnly?: boolean;
}) {
  return (
    <div className="space-y-4">
      {GUIDE_SLOT_KEYS.filter((key) => !buyableOnly || (slots[key].priceSource === 'catalog' && slots[key].price > 0 && slots[key].offers.length > 0)).map((key) => (
        <ComponentRow key={key} slotKey={key} label={GUIDE_SLOT_LABELS[key]} item={slots[key]} reference={references[key]} surface={surface} />
      ))}
    </div>
  );
}

function ComponentRow({
  label,
  slotKey,
  item,
  reference,
  surface,
}: {
  label: string;
  slotKey: GuideSlotKey;
  item: ResolvedGuideComponent;
  reference?: GuideReferenceOffer | null;
  surface: 'budget_guide' | 'budget_builder';
}) {
  const extraOffers = item.offers.slice(1, 3);
  const isCatalog = item.priceSource === 'catalog';
  const showPrice = isCatalog && item.price > 0;
  const reportContext = isCatalog || !reference ? { productId: item.productId, productName: item.name,
    storeId: item.offers[0]?.storeId, storeName: item.bestStoreName ?? undefined, offerUrl: item.bestStoreUrl ?? undefined }
    : { productId: reference.productId, productName: reference.productName,
      storeId: reference.storeId, storeName: reference.storeName, offerUrl: reference.url };

  return (
    <div className={`border-2 p-4 flex flex-col md:flex-row md:items-center gap-4 ${isCatalog ? 'border-border' : 'border-dashed border-muted'}`}>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="text-[12px] text-muted-foreground">{label}</span>
          <span className={`text-[12px] uppercase font-bold px-2 py-1 border-2 ${isCatalog ? 'border-secondary text-secondary' : 'border-muted text-muted-foreground'}`}>
            {isCatalog ? (item.offers[0]?.stock === 'low-stock' ? 'STOCK BAJO INFORMADO' : 'STOCK INFORMADO') : 'SIN OFERTA RECIENTE'}
          </span>
        </div>
        <h3 className="text-[12px] font-bold break-words">{item.name}</h3>
        <p className="text-[12px] text-muted-foreground mt-1">{item.description}</p>
        {isCatalog && item.bestStoreName && (
          <div className="mt-2">
            <p className="text-[12px] uppercase text-accent font-bold break-words">{`Menor precio observado (no garantizado): @${item.bestStoreName}`}</p>
            <p className="font-body text-xs mt-1">Última observación: {observationDate(item.offers[0]?.lastUpdated)}. El precio puede depender del medio de pago y no incluye necesariamente envío; confirmá precio final y stock en la tienda.</p>
          </div>
        )}
        {extraOffers.length > 0 && (
          <p className="text-[12px] uppercase text-muted-foreground mt-1 break-words">
            {extraOffers.map((offer) => `@${offer.storeName} ${formatPriceARS(offer.price)} — ${observationDate(offer.lastUpdated)}`).join(' · ')}
          </p>
        )}
        {!isCatalog && reference && (
          <p className="font-body text-xs mt-2 leading-relaxed">
            Última referencia: {reference.productName} en {reference.storeName || reference.storeId}, {formatPriceARS(reference.price)} observado el {observationDate(reference.lastUpdated)}. No confirma el precio ni el stock actuales y no entra al subtotal.
          </p>
        )}
      </div>
      <div className="text-left md:text-right shrink-0 min-w-0">
        <div className="text-[14px] sm:text-[16px] font-pixel text-primary break-words">
          {showPrice ? formatPriceARS(item.price) : 'Sin precio reciente'}
        </div>
        {isCatalog ? (
          <div className="text-[12px] text-muted-foreground">
            {item.storeCount === 1 ? '1 tienda informó stock en las últimas 3 h' : `${item.storeCount} tiendas informaron stock en las últimas 3 h`}
          </div>
        ) : (
          <div className="text-[12px] uppercase text-muted-foreground">Sin oferta observada en las últimas 3 h. No inferimos un precio de compra.</div>
        )}
        <div className="flex flex-col md:items-end gap-1 mt-1">
          {(item.productId || reference) && <OfferReportLink context={reportContext} />}
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
              className="inline-flex min-h-11 items-center text-[12px] text-secondary hover:underline"
            >
              Ver en tienda →
            </a>
          )}
          {item.productId && (
            <Link
              href={`/product/${item.productId}`}
              className="inline-flex min-h-11 items-center text-[12px] text-primary hover:underline"
            >
              Comparar tiendas →
            </Link>
          )}
          {!isCatalog && reference && (
            <a
              href={reference.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackStoreClick({
                productId: reference.productId,
                productName: reference.productName,
                storeName: reference.storeName,
                storeId: reference.storeId,
                price: reference.price,
                position: 1,
                category: slotKey,
                ctaId: 'guide_store_reference',
                destinationUrl: reference.url,
                surface,
                linkType: 'organic',
              })}
              className="inline-flex min-h-11 items-center text-[12px] text-secondary hover:underline"
            >
              Revisar publicación anterior →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
