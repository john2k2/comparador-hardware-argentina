import type { Metadata } from 'next';
import { Suspense } from 'react';
import { HomePageClient } from '@/components/home/HomePageClient';
import { FeaturedProductsSection } from '@/components/home/FeaturedProductsSection';
import { PriceDropSection } from '@/components/home/PriceDropSection';
import { PopularProductsSection } from '@/components/home/PopularProductsSection';
import { ProductGridSkeleton } from '@/components/ui/Skeleton';
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
  return (
    <div className="w-full min-w-0 max-w-[1760px] mx-auto px-4 xl:px-8 py-8">
      {/* Static content - loads immediately */}
      <HomePageClient 
        initialFeaturedProducts={[]}
        initialPriceDropProducts={[]}
        initialFeaturedFallbackUsed={false}
        initialPriceDropFallbackUsed={false}
        initialPopularProducts={[]}
        staticMode={true}
      />

      {/* Async sections with Suspense - load independently */}
      <Suspense fallback={<ProductGridSkeleton count={8} />}>
        <FeaturedProductsSection />
      </Suspense>

      <Suspense fallback={<ProductGridSkeleton count={8} />}>
        <PriceDropSection />
      </Suspense>

      <Suspense fallback={<ProductGridSkeleton count={8} />}>
        <PopularProductsSection />
      </Suspense>
    </div>
  );
}
