'use client';

import Image from 'next/image';
import { isImageHostWhitelisted, isKnownBlockedImageHost } from '@/lib/whitelisted-hosts';
import { normalizeDisplayText } from '@/lib/text-utils';
import { SyncTimestamp } from './SyncTimestamp';

type ProductImageProps = {
  image: string | null | undefined;
  productName: string;
  latestSyncAtMs: number;
  priority?: boolean;
};

function isWhitelisted(url: string): boolean {
  return isImageHostWhitelisted(url);
}

export function ProductImage({ image, productName, latestSyncAtMs, priority = false }: ProductImageProps) {
  const displayName = normalizeDisplayText(productName);

  return (
    <div className="relative aspect-square bg-black border-4 border-border pixel-shadow p-4 flex items-center justify-center">
      <div className="absolute top-2 left-2 w-4 h-4 border-t-4 border-l-4 border-primary" />
      <div className="absolute top-2 right-2 w-4 h-4 border-t-4 border-r-4 border-primary" />
      <div className="absolute bottom-2 left-2 w-4 h-4 border-b-4 border-l-4 border-primary" />
      <div className="absolute bottom-2 right-2 w-4 h-4 border-b-4 border-r-4 border-primary" />

      {image ? (
        <div className="relative w-full h-full">
          {isWhitelisted(image) ? (
            <Image
              src={image}
              alt={displayName}
              width={800}
              height={800}
              className="object-contain image-pixelated p-4 w-full h-full"
              priority={priority}
              loading={priority ? 'eager' : 'lazy'}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          ) : !isKnownBlockedImageHost(image) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt={displayName}
              width={800}
              height={800}
              className="object-contain image-pixelated p-4 w-full h-full"
              loading={priority ? 'eager' : 'lazy'}
              fetchPriority={priority ? 'high' : 'auto'}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <Image
              src="/pixel-box.svg"
              alt="Imagen no disponible"
              width={800}
              height={800}
              className="object-contain image-pixelated p-8 opacity-50 w-full h-full"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          )}
        </div>
      ) : (
        <div className="relative w-full h-full">
          <Image
            src="/pixel-box.svg"
            alt="No image"
            width={800}
            height={800}
            className="object-contain image-pixelated p-8 opacity-50 w-full h-full"
            sizes="(max-width: 1024px) 100vw, 50vw"
          />
        </div>
      )}
      <div className="absolute bottom-0 right-0 bg-primary text-primary-foreground px-3 py-1 text-[8px] font-bold uppercase border-l-4 border-t-4 border-border">
        <SyncTimestamp timestamp={latestSyncAtMs} />
      </div>
    </div>
  );
}
