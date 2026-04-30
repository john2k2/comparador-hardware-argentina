// ============================================
// ProductGrid - Grilla de productos
// ============================================

import { ProductCard } from './ProductCard';
import { ProductGridSkeleton } from '@/components/ui/Skeleton';
import type { Product } from '@/lib/types';

export interface ProductGridProps {
  products: Product[];
  isLoading?: boolean;
  emptyMessage?: string;
  className?: string;
  returnTo?: string | null;
  surface?: 'search_results' | 'home_featured' | 'home_recent' | 'home_price_drop' | 'home_popular' | 'related_products';
}

export function ProductGrid({
  products,
  isLoading = false,
  emptyMessage = 'No se encontraron productos',
  className,
  returnTo,
  surface,
}: ProductGridProps) {
  if (isLoading) {
    return <ProductGridSkeleton count={8} />;
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center border-2 border-dashed border-border bg-card/70">
        <p className="text-[10px] uppercase text-muted-foreground leading-relaxed">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div
      className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 lg:gap-6 ${className || ''}`}
    >
      {products.map((product, index) => (
        <ProductCard
          key={product.id}
          product={product}
          returnTo={returnTo}
          surface={surface}
          position={index + 1}
        />
      ))}
    </div>
  );
}

export default ProductGrid;
