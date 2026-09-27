import { GUIDE_CATALOG_CATEGORIES } from '@/lib/seo/budget-guide-pricing';
import { readGuideCatalogCandidatesFromDatabase, readProductsFromDatabase } from '@/lib/persistence/product-read';
import { logger } from '@/lib/logger';
import type { HardwareCategory, Product } from '@/lib/types';

const CATALOG_TTL_MS = 5 * 60 * 1000;
const CATEGORY_LIMIT = 24;
const FETCH_CONCURRENCY = 2;

let catalogMemo: { at: number; products: Product[] } | null = null;
const priorityMemo = new Map<string, { at: number; products: Product[] }>();

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await mapper(items[current]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

async function readCategoryCatalog(category: HardwareCategory): Promise<Product[]> {
  try {
    return await readGuideCatalogCandidatesFromDatabase(category, CATEGORY_LIMIT);
  } catch (error) {
    logger.warn('No se pudo leer una categoria del catalogo de guia', { category, error });
    return [];
  }
}

async function fetchGuideCatalogProducts(): Promise<Product[]> {
  const batches = await mapWithConcurrency(
    GUIDE_CATALOG_CATEGORIES,
    FETCH_CONCURRENCY,
    readCategoryCatalog,
  );
  return batches.flat();
}

export async function loadGuideCatalogProducts(): Promise<Product[]> {
  const now = Date.now();
  if (catalogMemo && now - catalogMemo.at < CATALOG_TTL_MS && catalogMemo.products.length > 0) {
    return catalogMemo.products;
  }

  const products = await fetchGuideCatalogProducts();
  if (products.length > 0) {
    catalogMemo = { at: now, products };
  }
  return products;
}

/** Amplía una guía con modelos concretos que pueden quedar fuera del top 24 general. */
export async function loadGuidePriorityProducts(category: HardwareCategory, terms: string[]): Promise<Product[]> {
  const queries = [...new Set(terms.map((term) => term.trim()).filter(Boolean))].slice(0, 2);
  if (queries.length === 0) return [];
  const cacheKey = `${category}:${queries.join('|')}`;
  const now = Date.now();
  const cached = priorityMemo.get(cacheKey);
  if (cached && now - cached.at < CATALOG_TTL_MS) return cached.products;

  const batches = await mapWithConcurrency(queries, 2, async (query) => {
    try {
      return await readProductsFromDatabase({ category, query, limit: 8 });
    } catch (error) {
      logger.warn('No se pudo leer un modelo prioritario de la guia', { category, query, error });
      return [];
    }
  });
  const products = [...new Map(batches.flat().map((product) => [product.id, product])).values()];
  priorityMemo.set(cacheKey, { at: now, products });
  return products;
}
