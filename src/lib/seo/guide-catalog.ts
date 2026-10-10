import { GUIDE_CATALOG_CATEGORIES, type GuideSlotSpec } from '@/lib/seo/budget-guide-pricing';
import { readGuideCatalogCandidatesFromDatabase } from '@/lib/persistence/product-read';
import type { BudgetGuideDefinition } from '@/lib/seo/budget-guides-data';
import { logger } from '@/lib/logger';
import type { HardwareCategory, Product } from '@/lib/types';

const CATALOG_TTL_MS = 5 * 60 * 1000;
const CATEGORY_LIMIT = 24;
const FETCH_CONCURRENCY = 2;
const PRIORITY_QUERIES_PER_COMPONENT = 2;
// Piezas × consultas por pieza no supera las seis conexiones simultáneas del Worker.
export const GUIDE_COMPONENT_CONCURRENCY = 3;

let catalogMemo: { at: number; products: Product[] } | null = null;
const priorityMemo = new Map<string, { at: number; products: Product[] }>();

export type GuideCatalogSnapshot = {
  products: Product[];
  unavailableSlots: (keyof BudgetGuideDefinition['components'])[];
};

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
    throw error;
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

export async function loadGuideCatalogProducts(guide?: BudgetGuideDefinition): Promise<Product[]> {
  if (guide) {
    const snapshot = await loadGuideCatalogSnapshot(guide);
    // El planificador no puede interpretar un fallo como una pieza sin destinos.
    if (snapshot.unavailableSlots.length) throw new Error('GUIDE_CATALOG_UNAVAILABLE');
    return snapshot.products;
  }
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

/** Conserva las lecturas válidas y distingue una consulta fallida de una consulta vacía. */
export async function loadGuideCatalogSnapshot(guide: BudgetGuideDefinition): Promise<GuideCatalogSnapshot> {
  const entries = Object.entries(guide.components) as [keyof BudgetGuideDefinition['components'], BudgetGuideDefinition['components'][keyof BudgetGuideDefinition['components']]][];
  const batches = await mapWithConcurrency(entries, GUIDE_COMPONENT_CONCURRENCY, async ([slot, spec]) => {
    const result = await loadGuidePrioritySnapshot(spec.category, spec.searchTerms, spec);
    return { slot, ...result };
  });
  return {
    products: [...new Map(batches.flatMap((batch) => batch.products).map((product) => [product.id, product])).values()],
    unavailableSlots: batches.filter((batch) => !batch.available).map((batch) => batch.slot),
  };
}

/** Amplía una guía con modelos concretos que pueden quedar fuera del top 24 general. */
export async function loadGuidePriorityProducts(category: HardwareCategory, terms: string[]): Promise<Product[]> {
  const result = await loadGuidePrioritySnapshot(category, terms);
  if (!result.available) throw new Error('GUIDE_CATALOG_UNAVAILABLE');
  return result.products;
}

async function loadGuidePrioritySnapshot(category: HardwareCategory, terms: string[], spec?: GuideSlotSpec): Promise<{ products: Product[]; available: boolean }> {
  const queries = [...new Set(terms.map((term) => term.trim()).filter(Boolean))].slice(0, PRIORITY_QUERIES_PER_COMPONENT);
  if (queries.length === 0) return { products: [], available: true };
  const constraints = spec ? { name: spec.name, exactModel: spec.exactModel, requiresIncludedCooler: spec.requiresIncludedCooler } : undefined;
  const cacheKey = JSON.stringify([category, queries, constraints]);
  const now = Date.now();
  const cached = priorityMemo.get(cacheKey);
  if (cached && now - cached.at < CATALOG_TTL_MS) return { products: cached.products, available: true };

  let available = true;
  const batches = await mapWithConcurrency(queries, PRIORITY_QUERIES_PER_COMPONENT, async (query) => {
    try {
      return constraints
        ? await readGuideCatalogCandidatesFromDatabase(category, 8, query, constraints)
        : await readGuideCatalogCandidatesFromDatabase(category, 8, query);
    } catch (error) {
      logger.warn('No se pudo leer un modelo prioritario de la guia', { category, query, error });
      available = false;
      return [];
    }
  });
  const products = [...new Map(batches.flat().map((product) => [product.id, product])).values()];
  // Nunca memorizar una respuesta vacía o parcial causada por un error.
  // La próxima petición puede recuperar el servicio sin esperar cinco minutos.
  if (available) priorityMemo.set(cacheKey, { at: now, products });
  return { products, available };
}
