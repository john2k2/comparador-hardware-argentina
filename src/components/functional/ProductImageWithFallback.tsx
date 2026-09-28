'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { normalizeProductImageUrl, PRODUCT_IMAGE_FALLBACK } from '@/lib/product-images';

type ProductImageWithFallbackProps = {
  src: string | null | undefined;
  alt: string;
  className?: string;
  fallbackClassName?: string;
  eager?: boolean;
};

export function ProductImageWithFallback({
  src,
  alt,
  className,
  fallbackClassName,
  eager = false,
}: ProductImageWithFallbackProps) {
  const usableSource = normalizeProductImageUrl(src) ?? null;
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const displayedSource = usableSource && failedSource !== usableSource ? usableSource : PRODUCT_IMAGE_FALLBACK;
  const isFallback = displayedSource === PRODUCT_IMAGE_FALLBACK;

  // Se usa el recurso remoto directamente: evita que una respuesta HTML o un
  // MIME incorrecto derribe el optimizador de Next. onError conserva el espacio.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={displayedSource}
      alt={isFallback ? 'Imagen no disponible' : alt}
      width={512}
      height={512}
      className={cn(className, isFallback && fallbackClassName)}
      loading={eager ? 'eager' : 'lazy'}
      fetchPriority={eager ? 'high' : 'auto'}
      decoding="async"
      onError={() => setFailedSource(usableSource)}
    />
  );
}
