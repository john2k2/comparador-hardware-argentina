import { getHomeSectionsData } from '@/lib/home/home-sections';
import { ProductGrid } from '@/components/functional/ProductGrid';
import { SectionTitle } from '@/components/home/SectionTitle';

export async function FeaturedProductsSection() {
  const { featuredProducts, featuredFallbackUsed } = await getHomeSectionsData();
  
  return (
    <>
      <SectionTitle
        title="PRODUCTOS DESTACADOS"
        subtitle={featuredFallbackUsed
          ? 'Explorá el catálogo y verificá las ofertas en cada ficha.'
          : 'Ofertas recientes para comparar entre tiendas.'}
        actionHref="/search"
        actionLabel="VER CATÁLOGO"
      />
      <ProductGrid
        products={featuredProducts.slice(0, 4)}
        compact
        emptyMessage="No se pudieron cargar destacados en este momento."
        surface="home_featured"
      />
    </>
  );
}
