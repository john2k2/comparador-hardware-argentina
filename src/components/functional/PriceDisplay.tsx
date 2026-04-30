// ============================================
// PriceDisplay - Versión Pixel Art Retro
// ============================================

import { formatPriceARS, calculateDiscount } from '@/lib/price-utils';
import { cn } from '@/lib/utils';

export interface PriceDisplayProps {
  price: number;
  originalPrice?: number;
  size?: 'sm' | 'md' | 'lg';
  showDiscount?: boolean;
  className?: string;
}

export function PriceDisplay({
  price,
  originalPrice,
  size = 'md',
  showDiscount = true,
  className,
}: PriceDisplayProps) {
  const discount = originalPrice ? calculateDiscount(originalPrice, price) : 0;

  const sizes = {
    sm: 'text-[12px]',
    md: 'text-[14px]',
    lg: 'text-[20px]',
  };

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {/* Precio Original Retro */}
      {showDiscount && originalPrice && originalPrice > price && (
        <div className="flex items-center gap-2">
          <span className="text-[8px] text-muted-foreground line-through decoration-primary decoration-2">
            {formatPriceARS(originalPrice)}
          </span>
          <span className="text-[8px] text-primary font-bold">
            -{discount}%
          </span>
        </div>
      )}

      {/* Precio Principal Neón */}
      <div className="flex items-baseline">
        <span
          className={cn(
            'text-secondary font-bold tracking-tighter',
            size === 'lg' && 'animate-pixel-blink',
            sizes[size]
          )}
        >
          {formatPriceARS(price)}
        </span>
        <span className={cn(
          "ml-1 text-[8px] text-secondary/60 uppercase",
          size === 'lg' && 'animate-pixel-blink'
        )}>$</span>
      </div>
    </div>
  );
}

export default PriceDisplay;
