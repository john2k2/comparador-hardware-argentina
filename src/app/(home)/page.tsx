import type { Metadata } from 'next';
import { Suspense } from 'react';
import { HomePageClient } from '@/components/home/HomePageClient';
import { LatestOffersSection } from '@/components/home/LatestOffersSection';
import { PriceDropSection } from '@/components/home/PriceDropSection';
import { ProductGridSkeleton } from '@/components/ui/Skeleton';
import { isEnebaPilotEnabled } from '@/lib/eneba/server';
import { ObservedHomeProvider, ObservedLatestOffers, ObservedPriceDrops } from '@/components/home/ObservedHomeSections';
import {
  HOME_PAGE_DESCRIPTION,
  HOME_PAGE_TITLE,
  buildPublicPageMetadata,
} from '@/lib/seo/metadata';

export const metadata: Metadata = buildPublicPageMetadata({
  path: '/',
  title: HOME_PAGE_TITLE,
  description: HOME_PAGE_DESCRIPTION,
  absoluteTitle: true,
});

export const revalidate = 300;

export default function HomePage() {
  if (process.env.PUBLIC_HOME_DOCUMENTS === '1') return (
    <div className="w-full min-w-0 max-w-[1440px] mx-auto px-4 xl:px-8 py-6">
      <ObservedHomeProvider><HomePageClient showGamesPromotion={isEnebaPilotEnabled()} latestOffersSection={<ObservedLatestOffers />} priceDropSection={<ObservedPriceDrops />} /></ObservedHomeProvider>
    </div>
  );
  return (
    <div className="w-full min-w-0 max-w-[1440px] mx-auto px-4 xl:px-8 py-6">
      <HomePageClient
        showGamesPromotion={isEnebaPilotEnabled()}
        latestOffersSection={
          <Suspense fallback={<ProductGridSkeleton count={4} />}>
            <LatestOffersSection />
          </Suspense>
        }
        priceDropSection={
          <Suspense fallback={<ProductGridSkeleton count={4} />}>
            <PriceDropSection />
          </Suspense>
        }
      />
    </div>
  );
}
