import { getHomeSectionsData } from '@/lib/home/home-sections';
import { ProductGrid } from '@/components/functional/ProductGrid';
import { SectionTitle } from '@/components/home/SectionTitle';
import { logger } from '@/lib/logger';

export async function PriceDropSection() {
  let data;
  try {
    data = await getHomeSectionsData();
  } catch (error) {
    // Este bloque es opcional: un fallo del catálogo no debe quitar la búsqueda.
    logger.warn('[Home] No se pudieron cargar las bajas de precio', { error });
    return null;
  }
  const { priceDropProducts, priceDropFallbackUsed, latestOfferProducts } = data;
  const latestIds = new Set(latestOfferProducts.map((product) => product.id));
  const products = priceDropProducts.filter((product) => !latestIds.has(product.id));

  // El catálogo ya tiene su acceso principal: no repetir una grilla como si fuera una baja.
  if (priceDropFallbackUsed || products.length === 0) return null;
  
  return (
    <>
      <SectionTitle
        title="BAJARON DE PRECIO"
        subtitle="Bajas registradas en el historial de las últimas 24 horas."
        actionHref="/search?sortBy=price-asc"
        actionLabel="MAS BARATOS"
      />
      <ProductGrid
        products={products.slice(0, 4)}
        compact
        emptyMessage="No hay productos con baja de precio detectada por ahora."
        surface="home_price_drop"
      />
    </>
  );
}
