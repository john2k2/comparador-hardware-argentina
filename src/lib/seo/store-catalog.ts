import 'server-only';
import { cache } from 'react';
import { getServerSupabaseReadClient } from '@/lib/server/supabase-server';
import { PRODUCT_SELECT_FIELDS } from '@/lib/persistence/product-read-helpers';
import { mapDbProduct } from '@/lib/persistence/product-read-mapper';
import type { DbProductRow, DbProductPriceRow } from '@/lib/persistence/product-read-types';
import { logger } from '@/lib/logger';
import { buildStoreCatalogSnapshot, getStoreLanding, type StoreCatalogSnapshot } from './store-landings';

const unavailable = (): StoreCatalogSnapshot => ({ products: [], freshProducts: 0, indexable: false, unavailable: true });

export const readStoreCatalog = cache(async (storeId: string): Promise<StoreCatalogSnapshot> => {
  if (!getStoreLanding(storeId)) return unavailable();
  const client = getServerSupabaseReadClient();
  if (!client) return unavailable();
  try {
    // Priorizar la observación de la oferta: el nombre del producto puede no haber cambiado.
    const productFields = PRODUCT_SELECT_FIELDS.replace(/,\s*product_prices \(\*\)/, '');
    const { data, error } = await client.from('product_prices')
      .select(`*, product:products!inner (${productFields})`)
      .eq('store_id', storeId)
      .in('stock', ['in-stock', 'low-stock'])
      .gt('price', 0)
      .order('last_updated', { ascending: false, nullsFirst: false })
      .limit(36)
      .abortSignal(AbortSignal.timeout(8000))
      .returns<(DbProductPriceRow & { product: DbProductRow })[]>();
    if (error) throw error;
    return buildStoreCatalogSnapshot((data ?? []).map((row) => mapDbProduct({ ...row.product, product_prices: [row] })), storeId);
  } catch {
    logger.warn('No se pudo leer la página de tienda', { storeId });
    return unavailable();
  }
});
