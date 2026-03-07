import { HomePageClient } from '@/components/home/HomePageClient';
import { getHomeSectionsData } from '@/lib/home/home-sections';

export const revalidate = 300;

export default async function HomePage() {
  const sections = await getHomeSectionsData().catch((error) => {
    console.warn('[Home Page] Initial sections unavailable:', error);
    return {
      featuredProducts: [],
      priceDropProducts: [],
      rules: null,
    };
  });

  return (
    <HomePageClient
      initialFeaturedProducts={sections.featuredProducts}
      initialPriceDropProducts={sections.priceDropProducts}
    />
  );
}
