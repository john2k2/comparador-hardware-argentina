import { GUIDE_CATALOG_CATEGORIES } from '@/lib/seo/budget-guide-pricing';
import { readProductsFromDatabase } from '@/lib/persistence/product-read';
import { logger } from '@/lib/logger';
import type { HardwareCategory, Product } from '@/lib/types';

const CATALOG_TTL_MS = 5 * 60 * 1000;
const CATEGORY_LIMIT = 1200;
const FETCH_CONCURRENCY = 2;

let catalogMemo: { at: number; products: Product[] } | null = null;

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
    return await readProductsFromDatabase({ limit: CATEGORY_LIMIT, category });
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
