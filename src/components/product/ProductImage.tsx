'use client';

import Image from 'next/image';
import { isImageHostWhitelisted, isKnownBlockedImageHost } from '@/lib/whitelisted-hosts';
import { normalizeDisplayText } from '@/lib/text-utils';

type ProductImageProps = {
  image: string | null | undefined;
  productName: string;
  latestSyncLabel: string | null;
};

function isWhitelisted(url: string): boolean {
  return isImageHostWhitelisted(url);
}

export function ProductImage({ image, productName, latestSyncLabel }: ProductImageProps) {
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
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          ) : !isKnownBlockedImageHost(image) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt={displayName}
              width={800}
              height={800}
              className="object-contain image-pixelated p-4 w-full h-full"
              loading="eager"
              fetchPriority="high"
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
        {latestSyncLabel ? `ACT: ${latestSyncLabel}` : 'ACT: N/D'}
      </div>
    </div>
  );
}
