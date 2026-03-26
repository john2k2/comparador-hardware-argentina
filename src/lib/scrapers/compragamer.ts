import type { HardwareCategory, Product } from '../types';
import { logger } from '../logger';
import {
  getCompraGamerBrandMap,
  getCompraGamerCatalog,
  getCompraGamerSubcategoryMap,
} from './compragamer-catalog';
import {
  mapCompraGamerProduct,
  matchesCompraGamerProductQuery,
  normalizeCompraGamerText,
} from './compragamer-mapper';

async function loadCompraGamerLookups(signal?: AbortSignal) {
  return Promise.all([
    getCompraGamerCatalog(signal),
    getCompraGamerSubcategoryMap(signal),
    getCompraGamerBrandMap(signal),
  ]);
}

function dedupeCompraGamerProducts(
  items: ReturnType<typeof mapCompraGamerProduct>[],
  categoryFilter?: HardwareCategory,
): Product[] {
  const products: Product[] = [];
  const seen = new Set<string>();

  for (const mapped of items) {
    if (!mapped) continue;
    if (categoryFilter && mapped.category !== categoryFilter) continue;
    if (seen.has(mapped.id)) continue;
    seen.add(mapped.id);
    products.push(mapped);
  }

  return products;
}

export async function fetchCompraGamerProducts(
  _categoryId: number,
  categorySlug: HardwareCategory,
  signal?: AbortSignal,
): Promise<Product[]> {
  try {
    const [catalog, subcategoryMap, brandMap] = await loadCompraGamerLookups(signal);
    const products = dedupeCompraGamerProducts(
      catalog.map((item) => mapCompraGamerProduct({ item, subcategoryMap, brandMap })),
      categorySlug,
    );

    logger.info(`[CompraGamer Scraper] Categoria ${categorySlug}: ${products.length} productos`);
    return products;
  } catch (error) {
    logger.error('[CompraGamer Scraper] Error al obtener catalogo estatico por categoria', { error });
    return [];
  }
}

export async function searchCompraGamerProducts(
  query: string,
  categoryHint?: HardwareCategory,
  signal?: AbortSignal,
): Promise<Product[]> {
  const normalizedQuery = normalizeCompraGamerText(query);
  if (!normalizedQuery) return [];

  try {
    const [catalog, subcategoryMap, brandMap] = await loadCompraGamerLookups(signal);
    const products = dedupeCompraGamerProducts(
      catalog
        .filter((item) => matchesCompraGamerProductQuery(item, normalizedQuery))
        .map((item) => mapCompraGamerProduct({ item, categoryHint, subcategoryMap, brandMap })),
    );

    logger.info(`[CompraGamer Scraper] Busqueda "${query}": ${products.length} productos`);
    return products;
  } catch (error) {
    logger.error('[CompraGamer Scraper] Error al buscar en catalogo estatico', { error });
    return [];
  }
}
