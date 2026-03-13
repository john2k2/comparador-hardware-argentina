import type { Metadata } from 'next';
import { HomePageClient } from '@/components/home/HomePageClient';
import { getHomeSectionsData } from '@/lib/home/home-sections';

export const metadata: Metadata = {
  title: 'Comparador de precios de hardware en Argentina',
  description: 'Compara precios de hardware en tiendas de Argentina. Procesadores, placas de video, RAM, SSD y mas con enlaces directos a cada tienda.',
};

export const revalidate = 300;

export default async function HomePage() {
  const sections = await getHomeSectionsData().catch((error) => {
    console.warn('[Home Page] Initial sections unavailable:', error);
    return {
      featuredProducts: [],
      priceDropProducts: [],
      featuredFallbackUsed: false,
      priceDropFallbackUsed: false,
      rules: null,
    };
  });

  return (
    <HomePageClient
      initialFeaturedProducts={sections.featuredProducts}
      initialPriceDropProducts={sections.priceDropProducts}
      initialFeaturedFallbackUsed={sections.featuredFallbackUsed}
      initialPriceDropFallbackUsed={sections.priceDropFallbackUsed}
    />
  );
}
