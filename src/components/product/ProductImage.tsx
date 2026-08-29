'use client';

import { ProductImageWithFallback } from '@/components/functional/ProductImageWithFallback';
import { normalizeDisplayText } from '@/lib/text-utils';
import { SyncTimestamp } from './SyncTimestamp';

type ProductImageProps = {
  image: string | null | undefined;
  productName: string;
  latestSyncAtMs: number;
  priority?: boolean;
};

export function ProductImage({ image, productName, latestSyncAtMs, priority = false }: ProductImageProps) {
  const displayName = normalizeDisplayText(productName);

  return (
    <div className="relative aspect-square overflow-hidden bg-black border-4 border-border pixel-shadow p-4 flex items-center justify-center">
      <div className="absolute top-2 left-2 w-4 h-4 border-t-4 border-l-4 border-primary" />
      <div className="absolute top-2 right-2 w-4 h-4 border-t-4 border-r-4 border-primary" />
      <div className="absolute bottom-2 left-2 w-4 h-4 border-b-4 border-l-4 border-primary" />
      <div className="absolute bottom-2 right-2 w-4 h-4 border-b-4 border-r-4 border-primary" />

      <div className="relative w-full h-full">
        <ProductImageWithFallback
          src={image}
          alt={displayName}
          eager={priority}
          className="object-contain p-4 w-full h-full"
          fallbackClassName="image-pixelated p-8 opacity-50"
        />
      </div>
      <div className="absolute bottom-0 right-0 bg-primary text-primary-foreground px-3 py-1 text-[8px] font-bold uppercase border-l-4 border-t-4 border-border">
        <SyncTimestamp timestamp={latestSyncAtMs} />
      </div>
    </div>
  );
}
