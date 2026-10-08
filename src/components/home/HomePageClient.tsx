'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ProductGrid, SearchBar } from '@/components/functional';
import { resolveSponsoredStores } from '@/lib/commercial';
import { HOME_BUDGET_GUIDE_LINKS } from '@/lib/seo/home-copy';
import { EditorialLinkCard } from '@/components/seo/EditorialLinkCard';
import { categories, stores as defaultStores } from '@/lib/scrapers/static-data';
import { readRecentlyViewedProducts } from '@/lib/client/recently-viewed';
import type { Product } from '@/lib/types';
import { buildCategoryLandingPath } from '@/lib/seo/category-landing-routes';
import { SponsoredStoresSection } from './SponsoredStoresSection';
import { hydrateProducts } from '@/lib/product-serialization';
import { SectionTitle } from './SectionTitle';
import { EnebaPromotion } from './EnebaPromotion';

const PRIMARY_CATEGORIES = ['procesadores', 'tarjetas-graficas', 'memoria-ram', 'motherboards'];
const RECENT_PRODUCTS_LIMIT = 4;

type HomePageClientProps = {
  latestOffersSection: ReactNode;
  priceDropSection: ReactNode;
  showGamesPromotion?: boolean;
};

export function HomePageClient({ latestOffersSection, priceDropSection, showGamesPromotion = false }: HomePageClientProps) {
  const router = useRouter();
  const sponsoredStores = useMemo(() => resolveSponsoredStores(defaultStores), []);
  const hasSponsoredStores = sponsoredStores.length > 0;
  const [recentProducts, setRecentProducts] = useState<Product[]>([]);

  useEffect(() => {
    const loadRecent = () => {
      setRecentProducts(hydrateProducts(readRecentlyViewedProducts(RECENT_PRODUCTS_LIMIT)));
    };
    loadRecent();
    window.addEventListener('focus', loadRecent);
    return () => window.removeEventListener('focus', loadRecent);
  }, []);

  const handleSearch = (query: string) => {
    const nextQuery = query.trim();
    router.push(nextQuery ? `/search?q=${encodeURIComponent(nextQuery)}` : '/search');
  };

  const categoryLink = (category: (typeof categories)[number]) => (
    <Link key={category.id} href={buildCategoryLandingPath(category.id)} prefetch={false}
      className="flex min-h-14 items-center justify-center border-2 border-border bg-background px-3 py-3 text-center font-mono text-sm font-bold text-foreground transition-colors hover:border-secondary hover:text-secondary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-secondary">
      {category.id === 'tarjetas-graficas' ? 'Placas de video' : category.name}
    </Link>
  );

  return (
    <>
      <section aria-labelledby="home-search-title" className="mb-6 min-w-0 max-w-full">
        <h1 id="home-search-title" className="mb-3 font-mono! text-base font-bold text-foreground">
          Compará precios de hardware
        </h1>
        <SearchBar onSearch={handleSearch} placeholder="[ BUSCAR PRODUCTO... ]" />
      </section>

      <div className={hasSponsoredStores ? 'grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_320px]' : ''}>
        <div className="min-w-0">
          <nav aria-label="Categorías de hardware" className="mb-8">
            <h2 className="mb-3 text-[12px] font-bold uppercase text-primary">[ Elegí un componente ]</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {categories.filter((category) => PRIMARY_CATEGORIES.includes(category.id)).map(categoryLink)}
            </div>
            <details className="mt-3">
              <summary className="min-h-11 cursor-pointer py-3 font-mono text-sm font-bold text-secondary marker:text-secondary">
                Más categorías: SSD, fuentes, gabinetes y periféricos
              </summary>
              <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-3">
                {categories.filter((category) => !PRIMARY_CATEGORIES.includes(category.id)).map(categoryLink)}
              </div>
            </details>
          </nav>

          {showGamesPromotion && <EnebaPromotion />}

          {recentProducts.length > 0 && (
            <>
              <SectionTitle title="VISTOS RECIENTEMENTE" subtitle="ULTIMOS PRODUCTOS QUE ABRISTE" />
              <ProductGrid products={recentProducts} surface="home_recent" />
            </>
          )}

          {latestOffersSection}

          <SectionTitle title="GUIAS PC GAMER" subtitle="Elegí una configuración por presupuesto." actionHref="/guia" actionLabel="VER TODAS" />
          <section className="mb-8 grid md:grid-cols-3 gap-4">
            {HOME_BUDGET_GUIDE_LINKS.map((guide) => (
              <EditorialLinkCard
                key={guide.slug}
                href={`/guia/${guide.slug}`}
                title={guide.title}
                description={guide.target}
                actionLabel="Ver guía"
              />
            ))}
          </section>

          <SectionTitle title="COMPARATIVAS" subtitle="Conocé las diferencias antes de elegir." actionHref="/comparativa" actionLabel="VER TODAS" />
          <section className="mb-8 grid md:grid-cols-3 gap-4">
            {[
              { slug: 'rtx-4060-vs-rx-7600', title: 'RTX 4060 vs RX 7600', category: 'GPUs' },
              { slug: 'ryzen-5-7600x-vs-ryzen-7-5700x', title: 'Ryzen 5 7600X vs 7 5700X', category: 'CPUs' },
              { slug: 'ddr5-vs-ddr4', title: 'DDR5 vs DDR4', category: 'RAM' },
            ].map((comparison) => (
              <EditorialLinkCard
                key={comparison.slug}
                href={`/comparativa/${comparison.slug}`}
                title={comparison.title}
                description={comparison.category}
                actionLabel="Ver comparativa"
              />
            ))}
          </section>

          {priceDropSection}
        </div>
        {hasSponsoredStores && (
          <div className="min-w-0 xl:sticky xl:top-28 xl:self-start">
            <SponsoredStoresSection stores={sponsoredStores} compact />
          </div>
        )}
      </div>

    </>
  );
}
