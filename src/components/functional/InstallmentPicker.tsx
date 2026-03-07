// ============================================
// InstallmentPicker - Selector de cuotas
// ============================================

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

  // Encontrar mejor opción (sin interés primero)
  const bestOption = installments.find(i => !i.interest) || installments[0];

  const handleSelect = (installment: InstallmentInfo, index: number) => {
    setSelectedInstallment(index);
    onSelect?.(installment);
  };

  if (!installments || installments.length === 0) {
    return null;
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
        <CreditCard className="h-4 w-4" />
        <span>Medios de pago</span>
      </div>

      <div className="space-y-2">
        {/* Precio al contado */}
        <button
          onClick={() => handleSelect({ count: 1, amount: currentPrice, totalAmount: currentPrice, interest: false }, -1)}
          className={cn(
            'w-full flex items-center justify-between p-3 rounded-lg border transition-colors',
            selectedInstallment === -1
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'
          )}
        >
          <span className="font-medium">Precio de contado</span>
          <span className="font-semibold text-green-600 dark:text-green-400">
            {formatPriceARS(currentPrice)}
          </span>
        </button>

        {/* Opciones de cuotas */}
        {installments.map((installment, index) => {
          const isBest = bestOption.count === installment.count && !installment.interest;
          const isSelected = selectedInstallment === index;

          return (
            <button
              key={index}
              onClick={() => handleSelect(installment, index)}
              className={cn(
                'w-full flex items-center justify-between p-3 rounded-lg border transition-colors relative',
                isSelected
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn(
                  'font-medium',
                  installment.interest ? 'text-zinc-600 dark:text-zinc-400' : ''
                )}>
                  {installment.count} cuotas de {formatPriceARS(installment.amount)}
                </span>
                {installment.interest && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                    con interés
                  </span>
                )}
                {isBest && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    mejor opción
                  </span>
                )}
              </div>
              <div className="text-right">
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatPriceARS(installment.totalAmount)}
                </span>
                {installment.interest && (
                  <p className="text-xs text-zinc-500">
                    +{formatPriceARS(installment.totalAmount - currentPrice)} de interés
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-start gap-2 text-xs text-zinc-500 dark:text-zinc-400 pt-2">
        <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
        <p>Los precios y disponibilidad pueden variar según la tienda. Las cuotas son aproximadas.</p>
      </div>
    </div>
  );
}

export default InstallmentPicker;
