import { getServerSupabaseServiceClient } from '@/lib/server/supabase-server';

/**
 * Limpia productos que tienen precios en $0 o sin tiendas asociadas
 * Estos productos aparecen en la UI pero no tienen información útil
 */
export async function cleanupZeroPriceProducts(): Promise<{
  cleaned: number;
  total: number;
  details: Array<{ id: string; name: string; reason: string }>;
}> {
  const supabase = getServerSupabaseServiceClient();
  if (!supabase) {
    throw new Error('Supabase no disponible');
  }

  const details: Array<{ id: string; name: string; reason: string }> = [];

  // 1. Buscar productos agrupados con precio 0 o sin precios
  const { data: zeroPriceProducts, error } = await supabase
    .from('products')
    .select('id, name, canonical_product_key')
    .like('id', 'agrupado-%')
    .or('lowest_price.eq.0,highest_price.eq.0');

  if (error) {
    throw new Error(`Error buscando productos: ${error.message}`);
  }

  // 2. Buscar productos agrupados sin precios en product_prices
  const { data: productsWithoutPrices } = await supabase
    .from('products')
    .select('id, name')
    .like('id', 'agrupado-%')
    .not('id', 'in', (
      supabase
        .from('product_prices')
        .select('product_id')
    ));

  const productsToClean = [
    ...(zeroPriceProducts || []),
    ...(productsWithoutPrices || []),
  ];

  // Eliminar duplicados
  const uniqueProducts = Array.from(
    new Map(productsToClean.map(p => [p.id, p])).values()
  );

  // 3. Marcar como no indexables o eliminar
  for (const product of uniqueProducts) {
    // Opción 1: Marcar como no indexable
    await supabase
      .from('products')
      .update({ 
        is_indexable: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', product.id);

    details.push({
      id: product.id,
      name: product.name || 'Sin nombre',
      reason: 'Precio $0 o sin tiendas asociadas',
    });
  }

  return {
    cleaned: uniqueProducts.length,
    total: uniqueProducts.length,
    details,
  };
}

/**
 * Verifica la salud de los productos en la base de datos
 */
export async function checkProductsHealth(): Promise<{
  totalProducts: number;
  withZeroPrice: number;
  withoutStores: number;
  withPrices: number;
  healthy: number;
}> {
  const supabase = getServerSupabaseServiceClient();
  if (!supabase) {
    throw new Error('Supabase no disponible');
  }

  // Total de productos agrupados
  const { count: totalProducts } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .like('id', 'agrupado-%');

  // Productos con precio 0
  const { count: withZeroPrice } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .like('id', 'agrupado-%')
    .or('lowest_price.eq.0,highest_price.eq.0');

  // Productos sin tiendas (sin precios en product_prices)
  const { data: productsWithPrices } = await supabase
    .from('product_prices')
    .select('product_id')
    .gt('price', 0);

  const productsWithPricesSet = new Set(productsWithPrices?.map(p => p.product_id) || []);

  // Productos agrupados que tienen precios
  const { data: allGroupedProducts } = await supabase
    .from('products')
    .select('id')
    .like('id', 'agrupado-%');

  const withoutStores = (allGroupedProducts || []).filter(
    p => !productsWithPricesSet.has(p.id)
  ).length;

  const withPrices = productsWithPricesSet.size;
  const healthy = (totalProducts || 0) - (withZeroPrice || 0) - withoutStores;

  return {
    totalProducts: totalProducts || 0,
    withZeroPrice: withZeroPrice || 0,
    withoutStores,
    withPrices,
    healthy: Math.max(0, healthy),
  };
}
