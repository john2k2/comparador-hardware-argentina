'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { isKnownBlockedImageHost } from '@/lib/whitelisted-hosts';

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
  const usableSource = src && !isKnownBlockedImageHost(src) ? src : null;
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const displayedSource = usableSource && failedSource !== usableSource ? usableSource : '/pixel-box.svg';
  const isFallback = displayedSource === '/pixel-box.svg';

  // Se usa el recurso remoto directamente: evita que una respuesta HTML o un
  // MIME incorrecto derribe el optimizador de Next. onError conserva el espacio.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={displayedSource}
      alt={isFallback ? 'Imagen no disponible' : alt}
      className={cn(className, isFallback && fallbackClassName)}
      loading={eager ? 'eager' : 'lazy'}
      fetchPriority={eager ? 'high' : 'auto'}
      decoding="async"
      onError={() => setFailedSource(usableSource)}
    />
  );
}
