import { useState } from 'react';
import { CreditCard, Info } from 'lucide-react';
import { formatPriceARS } from '@/lib/price-utils';
import { cn } from '@/lib/utils';
import type { InstallmentInfo } from '@/lib/types';

export interface InstallmentPickerProps {
  installments: InstallmentInfo[];
  currentPrice: number;
  onSelect?: (installment: InstallmentInfo) => void;
  className?: string;
}

export function InstallmentPicker({
  installments,
  currentPrice,
  onSelect,
  className,
}: InstallmentPickerProps) {
  const [selectedInstallment, setSelectedInstallment] = useState<number | null>(null);
  const bestOption = installments.find((item) => !item.interest) || installments[0];

  const handleSelect = (installment: InstallmentInfo, index: number) => {
    setSelectedInstallment(index);
    onSelect?.(installment);
  };

  if (!installments || installments.length === 0) {
    return null;
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2 text-[10px] uppercase font-bold text-foreground/80">
        <CreditCard className="h-4 w-4 text-secondary" />
        <span>Medios de pago</span>
      </div>

      <div className="space-y-2">
        <button
          onClick={() => handleSelect({ count: 1, amount: currentPrice, totalAmount: currentPrice, interest: false }, -1)}
          className={cn(
            'w-full min-h-11 flex items-center justify-between gap-3 p-3 border-2 transition-colors',
            selectedInstallment === -1
              ? 'border-secondary bg-secondary/10'
              : 'border-border bg-card hover:border-secondary',
          )}
        >
          <span className="text-[10px] uppercase font-bold">Precio de contado</span>
          <span className="text-[10px] font-bold text-secondary break-words">
            {formatPriceARS(currentPrice)}
          </span>
        </button>

        {installments.map((installment, index) => {
          const isBest = bestOption.count === installment.count && !installment.interest;
          const isSelected = selectedInstallment === index;

          return (
            <button
              key={index}
              onClick={() => handleSelect(installment, index)}
              className={cn(
                'w-full min-h-11 flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 border-2 transition-colors text-left',
                isSelected
                  ? 'border-secondary bg-secondary/10'
                  : 'border-border bg-card hover:border-secondary',
              )}
            >
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <span className="text-[10px] uppercase font-bold break-words">
                  {installment.count} cuotas de {formatPriceARS(installment.amount)}
                </span>
                {installment.interest && (
                  <span className="text-[8px] uppercase font-bold px-1.5 py-0.5 border-2 border-accent text-accent">
                    con interés
                  </span>
                )}
                {isBest && (
                  <span className="text-[8px] uppercase font-bold px-1.5 py-0.5 border-2 border-secondary text-secondary">
                    mejor opción
                  </span>
                )}
              </div>
              <div className="text-left sm:text-right min-w-0">
                <span className="text-[10px] font-bold text-foreground break-words">
                  {formatPriceARS(installment.totalAmount)}
                </span>
                {installment.interest && (
                  <p className="text-[8px] uppercase text-foreground/70">
                    +{formatPriceARS(installment.totalAmount - currentPrice)} de interés
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-start gap-2 text-[8px] uppercase text-foreground/70 pt-2">
        <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
        <p>Los valores pueden variar según el comercio. Las cuotas son aproximadas.</p>
      </div>
    </div>
  );
}

export default InstallmentPicker;
