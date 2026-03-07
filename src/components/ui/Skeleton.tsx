// ============================================
// Skeleton - Componente de carga
// ============================================

import { HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular';
  animation?: 'pulse' | 'wave' | 'none';
  width?: string | number;
  height?: string | number;
}

const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, variant = 'rectangular', animation = 'pulse', width, height, style, ...props }, ref) => {
    const variants = {
      text: 'rounded',
      circular: 'rounded-full',
      rectangular: 'rounded-lg',
    };

    const animations = {
      pulse: 'animate-pulse',
      wave: 'animate-shimmer',
      none: '',
    };

    return (
      <div
        ref={ref}
        className={cn(
          'bg-zinc-200 dark:bg-zinc-700',
          variants[variant],
          animations[animation],
          className
        )}
        style={{
          width: width,
          height: height,
          ...style,
        }}
        {...props}
      />
    );
  }
);

Skeleton.displayName = 'Skeleton';

// Skeletons predefinidos paraProductCard
export function ProductCardSkeleton() {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-4 space-y-3">
      <Skeleton variant="rectangular" height={160} />
      <Skeleton variant="text" width="80%" height={20} />
      <Skeleton variant="text" width="60%" height={16} />
      <div className="flex justify-between pt-2">
        <Skeleton variant="text" width="40%" height={24} />
        <Skeleton variant="circular" width={32} height={32} />
      </div>
    </div>
  );
}

// Skeleton para ProductGrid
export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

// Skeleton para SearchBar
export function SearchBarSkeleton() {
  return (
    <div className="flex gap-2">
      <Skeleton variant="rectangular" height={40} className="flex-1" />
      <Skeleton variant="rectangular" height={40} width={100} />
    </div>
  );
}

// Skeleton para filtros
export function FiltersSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton variant="text" width={100} height={20} />
      <Skeleton variant="rectangular" height={36} />
      <Skeleton variant="text" width={100} height={20} />
      <Skeleton variant="rectangular" height={36} />
      <Skeleton variant="text" width={100} height={20} />
      <div className="flex gap-2">
        <Skeleton variant="rectangular" width={60} height={28} />
        <Skeleton variant="rectangular" width={60} height={28} />
        <Skeleton variant="rectangular" width={60} height={28} />
      </div>
    </div>
  );
}

export { Skeleton };
