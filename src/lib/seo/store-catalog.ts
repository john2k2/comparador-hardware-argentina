import 'server-only';
import { cache } from 'react';
import { getServerSupabaseReadClient } from '@/lib/server/supabase-server';
import { PRODUCT_SELECT_FIELDS } from '@/lib/persistence/product-read-helpers';
import { mapDbProduct } from '@/lib/persistence/product-read-mapper';
import type { DbProductRow } from '@/lib/persistence/product-read-types';
import { logger } from '@/lib/logger';
import { buildStoreCatalogSnapshot, getStoreLanding, type StoreCatalogSnapshot } from './store-landings';

const unavailable = (): StoreCatalogSnapshot => ({ products: [], freshProducts: 0, indexable: false, unavailable: true });

export const readStoreCatalog = cache(async (storeId: string): Promise<StoreCatalogSnapshot> => {
  if (!getStoreLanding(storeId)) return unavailable();
  const client = getServerSupabaseReadClient();
  if (!client) return unavailable();
  try {
    // El filtro de tienda se aplica en PostgreSQL antes del límite y del mapeo.
    const { data, error } = await client.from('products')
      .select(PRODUCT_SELECT_FIELDS.replace('product_prices (*)', 'product_prices!inner (*)'))
      .eq('product_prices.store_id', storeId)
      .in('product_prices.stock', ['in-stock', 'low-stock'])
      .gt('product_prices.price', 0)
      .order('updated_at', { ascending: false })
      .limit(36)
      .abortSignal(AbortSignal.timeout(8000))
      .returns<DbProductRow[]>();
    if (error) throw error;
    return buildStoreCatalogSnapshot((data ?? []).map(mapDbProduct), storeId);
  } catch {
    logger.warn('No se pudo leer la página de tienda', { storeId });
    return unavailable();
  }
});
