import { getHomeSectionsData } from '@/lib/home/home-sections';
import { ProductGrid } from '@/components/functional/ProductGrid';
import { SectionTitle } from './SectionTitle';
import { logger } from '@/lib/logger';
import type { Product } from '@/lib/types';

export async function LatestOffersSection() {
  let latestOfferProducts: Product[] = [];
  let loadFailed = false;
  try {
    ({ latestOfferProducts } = await getHomeSectionsData());
  } catch (error) {
    loadFailed = true;
    logger.warn('[Home] No se pudieron cargar las últimas ofertas', { error });
  }

  return (
    <section id="ultimas-ofertas" aria-label="Últimas ofertas" className="scroll-mt-24">
      <SectionTitle
        title="ÚLTIMAS OFERTAS"
        subtitle="Una selección de distintas categorías y modelos, con precios y stock relevados en las últimas 3 horas."
        actionHref="/search?sortBy=newest"
        actionLabel="Ver catálogo"
      />
      <ProductGrid
        products={latestOfferProducts}
        compact
        emptyMessage={loadFailed
          ? 'No pudimos cargar las últimas ofertas. Podés explorar el catálogo o volver más tarde.'
          : 'Todavía no hay ofertas recientes verificadas para mostrar. Podés explorar el catálogo.'}
        surface="home_latest_offers"
      />
    </section>
  );
}
