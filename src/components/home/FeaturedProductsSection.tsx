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
          ? 'SELECCION ACTIVA DEL CATALOGO MIENTRAS SE RECONSTRUYE LA CURACION AUTOMATICA'
          : 'EN STOCK + ACTUALIZADOS < 24H + MEJOR PRECIO POR CATEGORIA'}
        actionHref="/search?q=rtx"
        actionLabel="VER TODO"
      />
      <ProductGrid
        products={featuredProducts}
        emptyMessage="No se pudieron cargar destacados en este momento."
        surface="home_featured"
      />
    </>
  );
}
