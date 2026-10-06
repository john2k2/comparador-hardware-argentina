import 'server-only';
import { getServerSupabaseReadClient } from '@/lib/server/supabase-server';
import { PRODUCT_SELECT_FIELDS, sanitizeSearchTerm } from '@/lib/persistence/product-read-helpers';
import { mapDbProduct } from '@/lib/persistence/product-read-mapper';
import type { DbProductRow } from '@/lib/persistence/product-read-types';
import { SLOT_CATEGORIES, type BuildSlot } from './types';
import { isStableRuntimeMode } from '@/lib/server/runtime-flags';
import { getStableFixtureProducts } from '@/lib/server/stable-search-fixtures';

export async function readBuilderCatalog(input: { slot?: BuildSlot; ids?: string[]; query?: string }) {
  if (isStableRuntimeMode()) {
    // La misma fuente sintética de búsqueda y detalle evita mezclar precios
    // públicos variables con los recorridos locales de guardado/restauración.
    if (input.ids) return getStableFixtureProducts({}).filter(product => input.ids!.includes(product.id));
    if (!input.slot) return [];
    return getStableFixtureProducts({ category:SLOT_CATEGORIES[input.slot], query:input.query });
  }
  const supabase = getServerSupabaseReadClient();
  if (!supabase) throw new Error('CATALOG_UNAVAILABLE');
  let query = supabase.from('products').select(PRODUCT_SELECT_FIELDS);
  if (input.ids) query = query.in('id', input.ids);
  else if (input.slot) {
    query = query.eq('category', SLOT_CATEGORIES[input.slot]);
    if (input.query) query = query.ilike('name', `%${sanitizeSearchTerm(input.query).replace(/_/g, ' ').slice(0, 80)}%`);
    else query = query.like('id', 'agrupado-%');
  } else return [];
  const { data, error } = await query.order('updated_at', { ascending: false }).limit(input.ids ? 8 : 32);
  if (error) throw new Error('CATALOG_UNAVAILABLE');
  return ((data ?? []) as DbProductRow[]).map(mapDbProduct);
}
