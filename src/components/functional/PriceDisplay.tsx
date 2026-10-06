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
  isReference?: boolean;
}

export function PriceDisplay({
  price,
  originalPrice,
  size = 'md',
  showDiscount = true,
  className,
  isReference = false,
}: PriceDisplayProps) {
  const discount = originalPrice ? calculateDiscount(originalPrice, price) : 0;

  const sizes = {
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-[clamp(1.5rem,2.5vw,2rem)]',
  };

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {/* Precio Original Retro */}
      {!isReference && showDiscount && originalPrice && originalPrice > price && (
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-foreground/80 line-through decoration-primary decoration-2">
            {formatPriceARS(originalPrice)}
          </span>
          <span className="text-[12px] text-primary font-bold">
            -{discount}%
          </span>
        </div>
      )}

      {/* Precio Principal Neón */}
      <div className="flex items-baseline min-w-0">
        <span
          className={cn(
            'font-bold tracking-tighter break-words',
            isReference ? 'text-muted-foreground' : 'text-secondary',
            sizes[size]
          )}
        >
          {formatPriceARS(price)}
        </span>
      </div>
    </div>
  );
}

export default PriceDisplay;
