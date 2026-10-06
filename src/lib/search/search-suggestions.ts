import type { HardwareCategory, Product } from '@/lib/types';
import { isHardwareCategory } from '@/lib/catalog/hardware-categories';
import { buildSearchRoute, parseSearchState } from './search-state';
import { resolveCategoryFromLandingSlug } from '@/lib/seo/category-landing-routes';

export const SEARCH_SUGGESTION_LIMIT = 5;
export const SEARCH_SUGGESTION_TTL_MS = 60_000;
export type SearchSuggestion = Pick<Product, 'id' | 'name' | 'category'>;

export function normalizeSuggestionQuery(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().replace(/\s+/g, ' ').normalize('NFC');
}

export function isSuggestionQuery(query: string): boolean { return query.length >= 3 && query.length <= 128; }

/** Abrir una sugerencia conserva también la consulta todavía no enviada. */
export function buildSuggestionProductHref(productId: string, query: string, source: URL): string {
  const params = Object.fromEntries(source.searchParams);
  const landingCategory = source.pathname.startsWith('/comparar/')
    ? resolveCategoryFromLandingSlug(source.pathname.slice('/comparar/'.length)) : null;
  const current = parseSearchState({ ...params, ...(landingCategory ? { category: landingCategory } : {}) });
  const next = parseSearchState({ ...params, q: query, ...(landingCategory ? { category: landingCategory } : {}) });
  const sameQuery = normalizeSuggestionQuery(current.query).toLowerCase() === normalizeSuggestionQuery(next.query).toLowerCase();
  const returnPath = buildSearchRoute({ ...next, page: sameQuery ? current.page : 1 });
  return `/product/${encodeURIComponent(productId)}?from=${encodeURIComponent(returnPath)}`;
}

/** La respuesta sólo contiene fichas: no promete precio, stock ni demanda. */
export function parseSearchSuggestions(value: unknown): SearchSuggestion[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((entry): SearchSuggestion[] => {
    if (!entry || typeof entry !== 'object') return [];
    const { id, name, category } = entry as Record<string, unknown>;
    if (typeof id !== 'string' || !id || id.length > 256 || /[\u0000-\u001f\u007f]/.test(id)
      || typeof name !== 'string' || !name.trim() || name.length > 300
      || typeof category !== 'string' || !isHardwareCategory(category) || seen.has(id)) return [];
    seen.add(id);
    return [{ id, name, category }];
  }).slice(0, SEARCH_SUGGESTION_LIMIT);
}

export function moveSuggestionIndex(current: number, key: string, count: number): number {
  if (!count) return -1;
  if (key === 'ArrowDown') return (current + 1) % count;
  if (key === 'ArrowUp') return current <= 0 ? count - 1 : current - 1;
  return current;
}

export const SUGGESTION_CATEGORY_LABELS: Record<HardwareCategory, string> = {
  procesadores: 'Procesador', 'tarjetas-graficas': 'Placa de video', motherboards: 'Motherboard',
  'memoria-ram': 'Memoria RAM', almacenamiento: 'Almacenamiento', 'fuentes-alimentacion': 'Fuente',
  gabinetes: 'Gabinete', refrigeracion: 'Refrigeración', computadoras: 'Computadora', perifericos: 'Periférico',
};

/** Caché corta por instancia; ninguna consulta se guarda en almacenamiento del visitante. */
export function createSuggestionLoader(fetcher: typeof fetch = fetch) {
  const cache = new Map<string, { at: number; items: SearchSuggestion[] }>();
  return async (query: string, signal: AbortSignal): Promise<SearchSuggestion[]> => {
    if (!isSuggestionQuery(query) || signal.aborted) return [];
    const cached = cache.get(query);
    if (cached && Date.now() - cached.at < SEARCH_SUGGESTION_TTL_MS) return cached.items;
    const response = await fetcher(`/api/search/suggestions?q=${encodeURIComponent(query)}`, { signal });
    if (!response.ok) throw new Error('Sugerencias no disponibles');
    const payload = await response.json() as { query?: string; suggestions?: unknown };
    if (signal.aborted || payload.query !== query) return [];
    const items = parseSearchSuggestions(payload.suggestions);
    cache.delete(query);
    cache.set(query, { at: Date.now(), items });
    while (cache.size > 40) cache.delete(cache.keys().next().value!);
    return items;
  };
}
