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
}

export function ProductGrid({
  products,
  isLoading = false,
  emptyMessage = 'No se encontraron productos',
  className,
  returnTo,
}: ProductGridProps) {
  if (isLoading) {
    return <ProductGridSkeleton count={8} />;
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-zinc-500 dark:text-zinc-400">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div
      className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 lg:gap-6 ${className || ''}`}
    >
      {products.map((product) => (
        <ProductCard key={product.id} product={product} returnTo={returnTo} />
      ))}
    </div>
  );
}

export default ProductGrid;
