import 'server-only';
import { getServerSupabaseReadClient } from '@/lib/server/supabase-server';
import { PRODUCT_SELECT_FIELDS, sanitizeSearchTerm } from '@/lib/persistence/product-read-helpers';
import { mapDbProduct } from '@/lib/persistence/product-read-mapper';
import type { DbProductRow } from '@/lib/persistence/product-read-types';
import { SLOT_CATEGORIES, type BuildSlot } from './types';
import { isStableRuntimeMode } from '@/lib/server/runtime-flags';
import { getStableFixtureProducts } from '@/lib/server/stable-search-fixtures';
import { readRecentOfferProductSelection, type CatalogSelectionCoverage } from '@/lib/persistence/recent-offer-products';
import { eligibleOffers } from './model';
import { isOfferFresh } from '@/lib/price-freshness';

export async function readBuilderCatalog(input: { slot?: BuildSlot; ids?: string[]; query?: string }) {
  return (await readBuilderCatalogSelection(input)).products;
}
export async function readBuilderCatalogSelection(input: { slot?: BuildSlot; ids?: string[]; query?: string }) {
  const eligibleCount = (products: ReturnType<typeof mapDbProduct>[]) => products
    .filter(product => eligibleOffers(product).some(offer => isOfferFresh(offer.lastUpdated))).length;
  const selection = (products: ReturnType<typeof mapDbProduct>[], source: 'fixture' | 'query', limit: number | null) => ({
    products, coverage: { source, receivedOffers: null, receivedProducts: products.length,
      eligibleProducts: eligibleCount(products),
      offerLimit: null, productLimit: limit, truncated: source === 'fixture' ? false : products.length === limit ? null : false,
      observedAt: new Date().toISOString() } as CatalogSelectionCoverage,
  });
  if (isStableRuntimeMode()) {
    // La misma fuente sintética de búsqueda y detalle evita mezclar precios
    // públicos variables con los recorridos locales de guardado/restauración.
    if (input.ids) return selection(getStableFixtureProducts({}).filter(product => input.ids!.includes(product.id)), 'fixture', null);
    if (!input.slot) return selection([], 'fixture', null);
    return selection(getStableFixtureProducts({ category:SLOT_CATEGORIES[input.slot], query:input.query }), 'fixture', null);
  }
  const supabase = getServerSupabaseReadClient();
  if (!supabase) throw new Error('CATALOG_UNAVAILABLE');
  // Los precios se renuevan sin modificar products.updated_at. También hay
  // publicaciones válidas de tiendas que todavía no tienen una fila agrupada.
  if (!input.ids && input.slot && !input.query) {
    const recent = await readRecentOfferProductSelection({ category: SLOT_CATEGORIES[input.slot] });
    // El lector D1 ya exige3h/comparable, pero el armador además exige HTTPS.
    // Contar con su contrato propio, sin alterar productos ni observaciones.
    return { ...recent, coverage: { ...recent.coverage, eligibleProducts: eligibleCount(recent.products) } };
  }
  let query = supabase.from('products').select(PRODUCT_SELECT_FIELDS);
  if (input.ids) query = query.in('id', input.ids);
  else if (input.slot) {
    query = query.eq('category', SLOT_CATEGORIES[input.slot]);
    if (input.query) query = query.ilike('name', `%${sanitizeSearchTerm(input.query).replace(/_/g, ' ').slice(0, 80)}%`);
    else query = query.like('id', 'agrupado-%');
  } else return selection([], 'query', null);
  const { data, error } = await query.order('updated_at', { ascending: false }).limit(input.ids ? 8 : 32);
  if (error) throw new Error('CATALOG_UNAVAILABLE');
  return selection(((data ?? []) as DbProductRow[]).map(mapDbProduct), 'query', input.ids ? 8 : 32);
}
