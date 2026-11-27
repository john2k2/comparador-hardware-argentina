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
import { EnebaBlackFridayBanner } from '@/components/digital-games/EnebaBlackFridayBanner';

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
        <h1 id="home-search-title" className="mb-2 font-mono! text-lg font-bold text-foreground md:text-xl">
          Compará precios de hardware en más de 30 tiendas argentinas
        </h1>
        <p className="mb-4 max-w-3xl font-body text-sm leading-relaxed text-muted-foreground md:text-base">
          Buscá un componente y mirá en un solo lugar quién lo tiene más barato, con stock y fecha de cada precio. Gratis y sin registrarte.
        </p>
        <SearchBar onSearch={handleSearch} placeholder="[ BUSCAR PRODUCTO... ]" />
        <nav aria-label="Comparar y armar hardware" className="mt-4 flex flex-wrap gap-3">
          <Link href="/comparativa/comparar" prefetch={false} className="pixel-button inline-flex min-h-11 items-center justify-center text-xs">Comparar dos modelos</Link>
          <Link href="/guia/armar" prefetch={false} className="pixel-button inline-flex min-h-11 items-center justify-center text-xs">Armar una PC</Link>
        </nav>
      </section>

      <section aria-labelledby="home-method-title" className="mb-8 min-w-0 border-2 border-border bg-card p-4 md:p-5 font-body text-sm leading-relaxed">
        <h2 id="home-method-title" className="font-mono! text-base font-bold text-secondary">Por qué confiar en nuestras comparaciones</h2>
        <ul className="mt-3 grid gap-4 md:grid-cols-3">
          <li><strong>Mismo modelo, sin trampas.</strong> Agrupamos sólo ofertas de la misma variante: no mezclamos una RTX 5060 con una 5060 Ti ni 16 GB con 32 GB.</li>
          <li><strong>Cada precio con su fecha.</strong> Ves cuándo revisamos cada oferta. Las guías y el armador usan precios de las últimas tres horas.</li>
          <li><strong>Costo final real.</strong> Podés sumar el envío de cada tienda y comparar totales antes de comprar.</li>
        </ul>
        <p className="mt-3 text-muted-foreground">No vendemos hardware: comprás directo en la tienda. <Link href="/acerca" prefetch={false} className="text-secondary underline underline-offset-4">Cómo comparamos</Link> · <Link href="/contacto" prefetch={false} className="text-secondary underline underline-offset-4">Reportar un precio incorrecto</Link></p>
      </section>

      {showGamesPromotion && <EnebaBlackFridayBanner surface="home" />}

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

          {showGamesPromotion && <EnebaPromotion />}
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
