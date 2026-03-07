// ============================================
// BestPriceBadge - Badge de mejor precio
// ============================================

import { Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BestPriceBadgeProps {
  className?: string;
  showText?: boolean;
}

export function BestPriceBadge({ className, showText = true }: BestPriceBadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs font-medium',
        className
      )}
    >
      <Trophy className="h-3 w-3" />
      {showText && <span>Mejor precio</span>}
    </div>
  );
}

export default BestPriceBadge;
