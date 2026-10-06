'use client';

import { ProductImageWithFallback } from '@/components/functional/ProductImageWithFallback';
import { normalizeDisplayText } from '@/lib/text-utils';

type ProductImageProps = { image: string | null | undefined; productName: string; priority?: boolean };

export function ProductImage({ image, productName, priority = false }: ProductImageProps) {
  return (
    <figure className="relative min-w-0 aspect-[4/3] max-h-[380px] overflow-hidden bg-card border-[3px] border-border pixel-shadow p-4 flex items-center justify-center">
      <div className="absolute top-2 left-2 w-3 h-3 border-t-[3px] border-l-[3px] border-primary" />
      <div className="absolute bottom-2 right-2 w-3 h-3 border-b-[3px] border-r-[3px] border-primary" />
      <ProductImageWithFallback src={image} alt={normalizeDisplayText(productName)} eager={priority}
        className="object-contain w-full h-full" fallbackClassName="image-pixelated p-8 opacity-50" />
      {!image && <figcaption className="absolute bottom-3 left-3 right-3 text-center font-body text-sm text-muted-foreground">Imagen sin verificar</figcaption>}
    </figure>
  );
}
