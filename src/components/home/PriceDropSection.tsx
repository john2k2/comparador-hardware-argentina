import { getHomeSectionsData } from '@/lib/home/home-sections';
import { ProductGrid } from '@/components/functional/ProductGrid';
import { SectionTitle } from '@/components/home/SectionTitle';

export async function PriceDropSection() {
  const { priceDropProducts, priceDropFallbackUsed } = await getHomeSectionsData();
  
  return (
    <>
      <SectionTitle
        title={priceDropFallbackUsed ? 'RECIEN ACTUALIZADOS' : 'BAJARON DE PRECIO'}
        subtitle={priceDropFallbackUsed
          ? 'FALLBACK HONESTO: MOSTRAMOS PRODUCTOS ACTIVOS HASTA TENER HISTORIAL SUFICIENTE'
          : 'PRODUCTOS CON BAJA REAL EN HISTORIAL DE 24H'}
        actionHref="/search?sortBy=price-asc"
        actionLabel={priceDropFallbackUsed ? 'VER CATALOGO' : 'MAS BARATOS'}
      />
      <ProductGrid
        products={priceDropProducts}
        emptyMessage={priceDropFallbackUsed
          ? 'No se pudieron cargar productos activos para esta seccion.'
          : 'No hay productos con baja de precio detectada por ahora.'}
        surface="home_price_drop"
      />
    </>
  );
}
