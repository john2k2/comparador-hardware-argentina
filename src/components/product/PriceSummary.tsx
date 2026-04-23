'use client';

import { PriceDisplay, InstallmentPicker } from '@/components/functional';
import { formatPriceARS } from '@/lib/price-utils';
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
  lowestComparablePrice,
  highestComparablePrice,
  selectedInstallment,
  onSelectInstallment,
}: PriceSummaryProps) {
  const bestPrice = merchantPrices[0] ?? product.prices.find((price) => price.price === lowestComparablePrice);
  const installments = bestPrice?.installment ? [bestPrice.installment] : [];
  const storesCompared = merchantPrices.length;
  const priceSpread = Math.max(0, highestComparablePrice - lowestComparablePrice);
  const spreadPercent = highestComparablePrice > 0
    ? Math.round((priceSpread / highestComparablePrice) * 100)
    : 0;

  return (
    <>
      <div className="bg-card border-4 border-border p-6 pixel-shadow">
        <h2 className="text-[12px] font-bold uppercase mb-4 text-secondary border-b-4 border-secondary inline-block pb-1">
          RESUMEN COMPARADOR
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="border-2 border-border bg-muted/40 p-3">
            <p className="text-[8px] uppercase text-muted-foreground mb-1">Tiendas</p>
            <p className="text-[12px] font-bold text-foreground">{storesCompared}</p>
          </div>
          <div className="border-2 border-border bg-muted/40 p-3">
            <p className="text-[8px] uppercase text-muted-foreground mb-1">Diferencia</p>
            <p className="text-[12px] font-bold text-primary">{formatPriceARS(priceSpread)}</p>
          </div>
          <div className="border-2 border-border bg-muted/40 p-3">
            <p className="text-[8px] uppercase text-muted-foreground mb-1">Ahorro Max</p>
            <p className="text-[12px] font-bold text-secondary">{spreadPercent}%</p>
          </div>
        </div>

        <p className="text-[8px] uppercase text-muted-foreground mt-3">
          {`Rango actual: ${formatPriceARS(lowestComparablePrice)} - ${formatPriceARS(highestComparablePrice)}`}
        </p>
      </div>

      <div className="bg-muted border-4 border-border p-6 pixel-shadow flex flex-col gap-4">
        <div>
          <p className="text-[10px] uppercase font-bold text-muted-foreground mb-2">MEJOR PRECIO DETECTADO</p>
          <PriceDisplay
            price={selectedInstallment ? selectedInstallment.totalAmount : (bestPrice?.price ?? lowestComparablePrice)}
            originalPrice={bestPrice?.originalPrice}
            size="lg"
          />
        </div>

        {installments.length > 0 && (
          <div className="pt-4 border-t-4 border-border border-dashed">
            <InstallmentPicker
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
