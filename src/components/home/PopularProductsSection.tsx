import { readPopularProductsFromDatabase } from '@/lib/persistence/product-read';
import { ProductGrid } from '@/components/functional/ProductGrid';
import { SectionTitle } from '@/components/home/SectionTitle';

export async function PopularProductsSection() {
  const popularProducts = await readPopularProductsFromDatabase(8);
  
  if (popularProducts.length === 0) return null;
  
  return (
    <>
      <SectionTitle
        title="PRODUCTOS POPULARES"
        subtitle="LOS MAS BUSCADOS Y COMPARADOS"
        actionHref="/search"
        actionLabel="VER CATALOGO"
      />
      <ProductGrid
        products={popularProducts}
        emptyMessage="No hay productos populares para mostrar."
        surface="home_popular"
      />
    </>
  );
}
