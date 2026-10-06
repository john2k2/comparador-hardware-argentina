'use client';

import { ExternalLink } from 'lucide-react';
import { PriceDisplay, InstallmentPicker } from '@/components/functional';
import { computeComparableStorePriceStats, formatPriceARS } from '@/lib/price-utils';
import { getRecentProductOffers } from '@/lib/product/product-page-metadata';
import { describeUnavailableOffers } from '@/lib/product/unavailable-offer-summary';
import { trackStoreClick } from '@/lib/analytics';
import { getOutboundStoreLinkType, getOutboundStoreRel } from '@/lib/commercial';
import { normalizeDisplayText } from '@/lib/text-utils';
import type { InstallmentInfo, Product, ProductPrice } from '@/lib/types';

type PriceSummaryProps = {
  product: Product;
  merchantPrices: ProductPrice[];
  lowestComparablePrice: number;
  highestComparablePrice: number;
  selectedInstallment: InstallmentInfo | null;
  onSelectInstallment: (installment: InstallmentInfo | null) => void;
};

export function PriceSummary({ product, merchantPrices, selectedInstallment, onSelectInstallment }: PriceSummaryProps) {
  const eligiblePrices = getRecentProductOffers({ ...product, prices: merchantPrices });
  const stats = computeComparableStorePriceStats(eligiblePrices);
  if (!eligiblePrices.length) {
    const unavailable = describeUnavailableOffers(product, merchantPrices);
    return (
      <section className="min-w-0 bg-card border-[3px] border-border p-4 md:p-6 pixel-shadow">
        <h2 className="text-base text-accent mb-3">{unavailable.heading}</h2>
        {unavailable.reasons.map((reason) => <p key={reason} className="font-body text-base leading-relaxed mt-2">{reason}</p>)}
        {unavailable.latestObservedAt && <p className="mt-3 font-body text-sm text-muted-foreground">
          Último precio relevado: {unavailable.latestObservedAt.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' })}
        </p>}
        <a href="#ofertas-por-tienda" className="mt-4 inline-flex min-h-11 items-center text-sm text-secondary underline underline-offset-4">Revisar publicaciones</a>
      </section>
    );
  }
  const bestPrice = eligiblePrices[0];
  const installments = bestPrice.installment ? [bestPrice.installment] : [];
  // Las cuotas deben seguir perteneciendo a la oferta que se está mostrando.
  const currentInstallment = selectedInstallment && installments.some((item) =>
    item.count === selectedInstallment.count && item.amount === selectedInstallment.amount
    && item.totalAmount === selectedInstallment.totalAmount && item.interest === selectedInstallment.interest
  ) ? selectedInstallment : null;
  const storeCount = new Set(eligiblePrices.map((price) => price.storeId)).size;
  const linkType = getOutboundStoreLinkType(bestPrice.storeId);
  return (
    <section className="min-w-0 bg-card border-[3px] border-border p-4 md:p-6 pixel-shadow space-y-4" aria-label="Precio y compra">
      <div>
        <p className="font-mono text-sm font-bold text-secondary mb-2">
          {currentInstallment ? `TOTAL EN ${currentInstallment.count} CUOTAS`
            : bestPrice.priceCondition === 'special' ? 'PRECIO ESPECIAL INFORMADO POR LA TIENDA' : 'MEJOR PRECIO REGISTRADO'}
        </p>
        <PriceDisplay price={currentInstallment?.totalAmount ?? bestPrice.price}
          originalPrice={currentInstallment ? undefined : bestPrice.originalPrice} size="lg" />
        <p className="font-body text-base mt-2">En <strong>{normalizeDisplayText(bestPrice.storeName)}</strong>{linkType === 'sponsored' && <span className="ml-2 text-primary text-sm">Patrocinado</span>}</p>
        <p className="font-body text-sm text-muted-foreground mt-1">
          Precio relevado: {new Date(bestPrice.lastUpdated).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' })}
        </p>
      </div>
      <p className="font-body text-sm leading-relaxed text-muted-foreground">
        {bestPrice.priceCondition === 'special' ? 'Precio especial sujeto al medio de pago que indique la tienda. ' : ''}
        Confirmá precio final, stock, envío y forma de pago en el comercio.
      </p>
      <a href={bestPrice.url} target="_blank" rel={getOutboundStoreRel(linkType)}
        onClick={() => trackStoreClick({ productId: product.id, productName: product.name, category: product.category,
          storeId: bestPrice.storeId, storeName: bestPrice.storeName, price: bestPrice.price,
          position: 1, ctaId: 'product_best_offer', destinationUrl: bestPrice.url, surface: 'product_detail', linkType })}
        className="flex min-h-12 items-center justify-center gap-2 bg-secondary text-secondary-foreground border-2 border-secondary px-4 py-3 font-mono text-sm font-bold pixel-shadow focus-visible:outline-2 focus-visible:outline-offset-4">
        Ver en {normalizeDisplayText(bestPrice.storeName)} <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="sr-only"> (abre una pestaña nueva)</span>
      </a>
      {storeCount > 1 ? (
        <div className="border-t border-border/50 pt-3 font-body text-sm leading-relaxed">
          <p>{storeCount} tiendas con oferta comparable en las últimas 24 h.</p>
          <p className="text-muted-foreground">Rango: {formatPriceARS(stats.lowest)} – {formatPriceARS(stats.highest)} · diferencia {formatPriceARS(stats.highest - stats.lowest)}.</p>
        </div>
      ) : <p className="font-body text-sm text-muted-foreground">Una tienda con oferta comparable en las últimas 24 h. Todavía no hay precios de otras tiendas para medir una diferencia.</p>}
      {installments.length > 0 && (
        <details className="border-t border-border/50 pt-2">
          <summary className="min-h-11 flex items-center cursor-pointer font-mono text-sm font-bold text-secondary">Ver cuotas y medios de pago</summary>
          <InstallmentPicker key={`${bestPrice.storeId}:${bestPrice.url}:${JSON.stringify(bestPrice.installment)}`}
            installments={installments} currentPrice={bestPrice.price} onSelect={onSelectInstallment} />
        </details>
      )}
    </section>
  );
}
