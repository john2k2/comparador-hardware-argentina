'use client';

import { PriceDisplay, InstallmentPicker } from '@/components/functional';
import { computeComparableStorePriceStats, formatPriceARS } from '@/lib/price-utils';
import { needsIdentityReview } from '@/lib/quality/offer-identity';
import type { Product, ProductPrice } from '@/lib/types';

type PriceSummaryProps = {
  product: Product;
  merchantPrices: ProductPrice[];
  lowestComparablePrice: number;
  highestComparablePrice: number;
  selectedInstallment: {
    count: number;
    amount: number;
    totalAmount: number;
    interest: boolean;
  } | null;
  onSelectInstallment: (installment: {
    count: number;
    amount: number;
    totalAmount: number;
    interest: boolean;
  } | null) => void;
};

export function PriceSummary({
  product,
  merchantPrices,
  selectedInstallment,
  onSelectInstallment,
}: PriceSummaryProps) {
  const { comparablePrices: eligiblePrices, lowest: lowestComparablePrice, highest: highestComparablePrice } = computeComparableStorePriceStats(
    merchantPrices.filter((price) => !needsIdentityReview(price, product) && (price.stock === 'in-stock' || price.stock === 'low-stock')),
  );
  if (eligiblePrices.length === 0) {
    return (
      <div className="bg-card border-4 border-border p-4 md:p-6 pixel-shadow">
        <h2 className="text-[12px] font-bold uppercase mb-3 text-accent">OFERTAS POR CORROBORAR</h2>
        <p className="text-[10px] leading-relaxed">Todavía no hay una oferta disponible con identidad apta para comparar. Podés consultar las condiciones en cada tienda.</p>
      </div>
    );
  }
  const bestPrice = eligiblePrices[0];
  const installments = bestPrice?.installment ? [bestPrice.installment] : [];
  // Una actualización puede cambiar la mejor tienda: no reutilizar cuotas de la oferta anterior.
  const currentInstallment = selectedInstallment && installments.some((installment) => (
    installment.count === selectedInstallment.count
    && installment.amount === selectedInstallment.amount
    && installment.totalAmount === selectedInstallment.totalAmount
    && installment.interest === selectedInstallment.interest
  )) ? selectedInstallment : null;
  const storesCompared = eligiblePrices.length;
  const priceSpread = Math.max(0, highestComparablePrice - lowestComparablePrice);
  const spreadPercent = highestComparablePrice > 0
    ? Math.round((priceSpread / highestComparablePrice) * 100)
    : 0;

  return (
    <>
      <div className="bg-card border-4 border-border p-4 md:p-6 pixel-shadow min-w-0">
        <h2 className="text-[12px] font-bold uppercase mb-4 text-secondary border-b-4 border-secondary inline-block pb-1">
          RESUMEN COMPARADOR
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="border-2 border-border bg-muted/40 p-3">
            <p className="text-[8px] uppercase text-foreground/80 mb-1">Tiendas</p>
            <p className="text-[12px] font-bold text-foreground">{storesCompared}</p>
          </div>
          <div className="border-2 border-border bg-muted/40 p-3">
            <p className="text-[8px] uppercase text-foreground/80 mb-1">Diferencia</p>
            <p className="text-[12px] font-bold text-primary">{formatPriceARS(priceSpread)}</p>
          </div>
          <div className="border-2 border-border bg-muted/40 p-3">
            <p className="text-[8px] uppercase text-foreground/80 mb-1">Ahorro Max</p>
            <p className="text-[12px] font-bold text-secondary">{spreadPercent}%</p>
          </div>
        </div>

        <p className="text-[8px] uppercase text-foreground/80 mt-3">
          {`Rango actual: ${formatPriceARS(lowestComparablePrice)} - ${formatPriceARS(highestComparablePrice)}`}
        </p>
      </div>

      <div className="bg-muted border-4 border-border p-4 md:p-6 pixel-shadow flex flex-col gap-4 min-w-0">
        <div>
          <p className="text-[10px] uppercase font-bold text-foreground/80 mb-2">
            {currentInstallment ? `TOTAL EN ${currentInstallment.count} CUOTAS` : 'MEJOR PRECIO DETECTADO'}
          </p>
          <PriceDisplay
            price={currentInstallment ? currentInstallment.totalAmount : bestPrice.price}
            originalPrice={currentInstallment ? undefined : bestPrice.originalPrice}
            size="lg"
          />
        </div>

        {installments.length > 0 && (
          <div className="pt-4 border-t-4 border-border border-dashed">
            <InstallmentPicker
              key={`${bestPrice.storeId}:${bestPrice.url}:${bestPrice.price}:${JSON.stringify(bestPrice.installment)}`}
              installments={installments}
              currentPrice={bestPrice?.price ?? lowestComparablePrice}
              onSelect={onSelectInstallment}
            />
          </div>
        )}
      </div>
    </>
  );
}
