import { loadCatalogRefreshDemands, type CatalogRefreshDemand } from './refresh-demand';
import { getServerSupabaseReadClient } from '@/lib/server/supabase-server';
import { PRODUCT_SELECT_FIELDS } from '@/lib/persistence/product-read-helpers';
import { mapDbGuideProduct } from '@/lib/persistence/product-read-mapper';
import type { DbProductRow } from '@/lib/persistence/product-read-types';
import { inferHardwareCategoryFromName } from './hardware-categories';
import { guardCategoryPage } from '@/lib/search/category-page-guard';
import { matchesSearchQueryIntent, normalizeSearchText } from '@/lib/search/search-ranking';
import { parseCpuModelSignature, parseGpuChipSignature } from '@/lib/product-identity';
import { isComparableStoreOffer } from '@/lib/price-utils';
import { listingReference } from '@/lib/scrapers/listing-reference';
import { parseRefreshTargets } from './on-demand/contracts';
import { PRIORITY_RECHECK_MS, targetKey, type PriorityGroup } from './priority-planning';
import type { Product } from '@/lib/types';

export const PRIORITY_MAX_DEMANDS = 3;
export const PRIORITY_DEMAND_PRODUCTS_PER_QUERY = 5;
export const PRIORITY_MAX_DEMAND_OFFERS = 10;
export const PRIORITY_DEMAND_MAX_MS = 3 * 60_000;
// Reservar 55 s para detalle/fallback/espaciado y 35 s para revisión y guardado.
export const PRIORITY_DEMAND_REQUEST_RESERVE_MS = 90_000;
const DEMAND_RECENT_MS = 24 * 3600_000;

/** Señal agregada de solicitudes: nunca usuarios ni prueba de disponibilidad. */
export function selectRecentDemandQueries(demands: CatalogRefreshDemand[], now: number): CatalogRefreshDemand[] {
  const selected = new Map<string, CatalogRefreshDemand>();
  for (const demand of demands) {
    const requestedAt = Date.parse(demand.lastRequestedAt);
    const query = demand.query?.replace(/\s+/g, ' ').trim();
    if (!query || query.length < 2 || query.length > 120 || !/[\p{L}\p{N}]/u.test(query)
      || /[\x00-\x1f\x7f]/.test(demand.query!) || !Number.isFinite(requestedAt)
      || requestedAt > now || now - requestedAt > DEMAND_RECENT_MS) continue;
    const key = JSON.stringify([query.toLowerCase(), demand.category ?? null]);
    if (!selected.has(key)) selected.set(key, { ...demand, query });
    if (selected.size === PRIORITY_MAX_DEMANDS) break;
  }
  return [...selected.values()];
}

export function planDemandGroups(products: Product[], now: number): PriorityGroup[] {
  return products.map(product => {
    const covered = product.prices.some(price => {
      const observedAt = new Date(price.lastUpdated).getTime();
      return isComparableStoreOffer(price, product) && Number.isFinite(observedAt)
        && observedAt <= now && now - observedAt < PRIORITY_RECHECK_MS;
    });
    const known = product.prices.filter(price => listingReference(price.storeId, price.url)
      && parseRefreshTargets([{ productId: product.id, storeId: price.storeId, url: price.url }]));
    const available = (stock: string) => ['in-stock', 'low-stock'].includes(stock);
    known.sort((a, b) => Number(available(b.stock)) - Number(available(a.stock)) || a.price - b.price);
    const targets = known.map(price => ({ productId: product.id, storeId: price.storeId, url: price.url }));
    return { key: `demand/${product.id}`, covered,
      targets: [...new Map(targets.map(target => [targetKey(target), target])).values()].slice(0, 2) };
  });
}

/** Dos lecturas acotadas: selección indexada de IDs y sus referencias existentes.
 * No requiere totales de búsqueda ni un JOIN de todas las ofertas candidatas. */
export async function readDemandProducts(demand: CatalogRefreshDemand): Promise<Product[]> {
  const query = demand.query ?? '';
  const normalized = normalizeSearchText(query);
  const tokens = [...new Set(normalized.match(/[a-z0-9]+/g) ?? [])];
  if (!tokens.length) return [];
  const client = getServerSupabaseReadClient();
  if (!client) throw new Error('PRIORITY_DEMAND_DATABASE_UNAVAILABLE');
  const category = demand.category ?? inferHardwareCategoryFromName(demand.query!);
  let candidates = client.from('products').select('id').order('updated_at', { ascending: false })
    .order('id', { ascending: true }).limit(PRIORITY_DEMAND_PRODUCTS_PER_QUERY);
  if (category) candidates = candidates.eq('category', category);
  for (const token of tokens) candidates = candidates.ilike('catalog_document', `%${token}%`);
  // La variante explícita se filtra antes del LIMIT: 5700X3D no desplaza 5700X.
  // Sólo se generan patrones de firmas ya parseadas; nunca sintaxis del texto crudo.
  const boundary = (pattern: string) => `(^|[^a-z0-9])(${pattern})([^a-z0-9]|$)`;
  const gpu = parseGpuChipSignature(query);
  const cpu = gpu ? null : parseCpuModelSignature(query);
  if (cpu) candidates = candidates.filter('name', 'imatch', boundary(`${cpu.number}${cpu.suffixes.join('')}`));
  if (gpu) {
    candidates = candidates.filter('name', 'imatch', boundary(`${gpu.family}[^a-z0-9]*${gpu.number}`
      + gpu.suffixes.map(suffix => `[^a-z0-9]*${suffix}`).join('')));
    if (gpu.suffixes.length && !gpu.suffixes.includes('super')) candidates = candidates.not('name', 'imatch', boundary('super'));
  }
  const kit = normalized.match(/\b([24])\s*x\s*(\d{1,3})\s*gb\b/);
  if (kit) candidates = candidates.filter('name', 'imatch', boundary(`${kit[1]}[^a-z0-9]*x[^a-z0-9]*${kit[2]}[^a-z0-9]*gb`));
  const selected = await candidates;
  if (selected.error) throw new Error('PRIORITY_DEMAND_READ_FAILED');
  if (!Array.isArray(selected.data) || selected.data.length > PRIORITY_DEMAND_PRODUCTS_PER_QUERY
    || selected.data.some(row => typeof row.id !== 'string' || !/^[\w.-]{1,240}$/.test(row.id))) throw new Error('PRIORITY_DEMAND_INVALID_RESPONSE');
  const ids = [...new Set(selected.data.map(row => row.id as string))];
  if (!ids.length) return [];
  const hydrated = await client.from('products').select(PRODUCT_SELECT_FIELDS).in('id', ids).limit(ids.length);
  if (hydrated.error) throw new Error('PRIORITY_DEMAND_READ_FAILED');
  if (!Array.isArray(hydrated.data) || hydrated.data.length > ids.length
    || hydrated.data.some(row => !ids.includes(row.id))) throw new Error('PRIORITY_DEMAND_INVALID_RESPONSE');
  return guardCategoryPage((hydrated.data as DbProductRow[]).map(mapDbGuideProduct), category).products
    .filter(product => matchesSearchQueryIntent(product.name, query));
}

export async function loadPriorityDemandPlan(now: number, shouldContinue: () => boolean = () => true) {
  // Filtrar antes del corte de tres: categorías solas no desplazan una query real.
  const demands = await loadCatalogRefreshDemands(20, {
    since: new Date(now - DEMAND_RECENT_MS).toISOString(), strict: true, maxRows: 20,
  });
  if (!demands) throw new Error('PRIORITY_DEMAND_DATABASE_UNAVAILABLE');
  const selected = selectRecentDemandQueries(demands, now);
  const products = new Map<string, Product>();
  let deferred = false;
  for (const demand of selected) {
    if (!shouldContinue()) { deferred = true; break; }
    const found = await readDemandProducts(demand);
    for (const product of found) {
      if (!demand.category || product.category === demand.category) products.set(product.id, product);
    }
  }
  return { demands: selected.length, products: [...products.values()], groups: planDemandGroups([...products.values()], now), deferred };
}
