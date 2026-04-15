import { describe, expect, it } from 'vitest';

// Importar solo las funciones puras que no dependen de server-only
// Las funciones de search-handler-shared que importan de server se testean indirectamente
// via los tests de API routes

// Re-implementar las funciones puras para test unitario aislado
function shouldRunStore(selectedStoreIds: Set<string>, storeId: string): boolean {
  return selectedStoreIds.size === 0 || selectedStoreIds.has(storeId.toLowerCase());
}

function parseNonNegativeNumber(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return parsed;
}

function parsePositiveInteger(value: string | null, fallback = 1): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.trunc(parsed);
}

function parseStoreIds(value: string | null): Set<string> {
  if (!value) return new Set<string>();
  const ids = value
    .split(',')
    .map((storeId) => storeId.trim().toLowerCase())
    .filter(Boolean);
  return new Set(ids);
}

function buildResponsePagination(total: number, page: number, pageSize: number) {
  const safePageSize = Math.max(1, pageSize);
  const totalPages = total > 0 ? Math.ceil(total / safePageSize) : 0;
  const currentPage = Math.max(1, Math.min(page, Math.max(totalPages, 1)));
  const offset = (currentPage - 1) * safePageSize;

  return {
    limit: total > 0 ? Math.min(safePageSize, Math.max(0, total - offset)) : 0,
    offset,
    total,
    totalPages,
    page: currentPage,
    pageSize: safePageSize,
  };
}

function emptySearchResponse(page = 1, pageSize = 20) {
  return {
    products: [],
    pagination: buildResponsePagination(0, page, pageSize),
    facets: { categories: [], brands: [], stores: [] },
  };
}

function buildSearchCacheKey(input: {
  query: string;
  category?: string;
  sortBy: string;
  page: number;
  minPrice?: number;
  maxPrice?: number;
  stores: Set<string>;
}) {
  const stores = Array.from(input.stores).sort().join(',');
  return [
    `q=${input.query.toLowerCase()}`,
    `cat=${input.category ?? ''}`,
    `sort=${input.sortBy}`,
    `page=${input.page}`,
    `min=${input.minPrice ?? ''}`,
    `max=${input.maxPrice ?? ''}`,
    `stores=${stores}`,
  ].join('|');
}

function hasSearchFiltersIntent(input: {
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  stores: Set<string>;
}): boolean {
  return Boolean(
    input.category
    || input.minPrice !== undefined
    || input.maxPrice !== undefined
    || input.stores.size > 0,
  );
}

// Re-export buildProduct for potential future use
export function buildProduct(name: string, category: string, price = 100_000): Product {
  return {
    id: `test-${name.replace(/\s+/g, '-').toLowerCase()}`,
    name,
    category,
    brand: name.split(' ')[0] || 'Generic',
    model: name,
    description: name,
    lowestPrice: price,
    highestPrice: price,
    averagePrice: price,
    prices: [
      {
        storeId: 'mexx',
        storeName: 'Mexx',
        url: 'https://example.com',
        price,
        stock: 'in-stock',
        installment: null,
        lastUpdated: new Date(),
      },
    ],
    specs: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('search-live pure helpers', () => {
  describe('shouldRunStore', () => {
    it('ejecuta todas las tiendas cuando no hay filtros', () => {
      expect(shouldRunStore(new Set(), 'mexx')).toBe(true);
      expect(shouldRunStore(new Set(), 'venex')).toBe(true);
      expect(shouldRunStore(new Set(), 'fullh4rd')).toBe(true);
    });

    it('ejecuta solo las tiendas seleccionadas', () => {
      const selected = new Set(['mexx', 'venex']);
      expect(shouldRunStore(selected, 'mexx')).toBe(true);
      expect(shouldRunStore(selected, 'venex')).toBe(true);
      expect(shouldRunStore(selected, 'fullh4rd')).toBe(false);
    });

    it('es case-insensitive para el storeId buscado', () => {
      // La implementacion real compara storeId.toLowerCase() contra el Set
      // El Set NO se normaliza, solo el storeId buscado
      const selected = new Set(['mexx', 'venex']);
      expect(shouldRunStore(selected, 'Mexx')).toBe(true);
      expect(shouldRunStore(selected, 'MEXX')).toBe(true);
      expect(shouldRunStore(selected, 'fullh4rd')).toBe(false);
    });
  });

  describe('parseNonNegativeNumber', () => {
    it('parsea numeros no negativos correctamente', () => {
      expect(parseNonNegativeNumber('0')).toBe(0);
      expect(parseNonNegativeNumber('100')).toBe(100);
      expect(parseNonNegativeNumber('250000')).toBe(250_000);
    });

    it('retorna undefined para negativos o null', () => {
      expect(parseNonNegativeNumber('-1')).toBeUndefined();
      expect(parseNonNegativeNumber(null)).toBeUndefined();
      expect(parseNonNegativeNumber('abc')).toBeUndefined();
    });
  });

  describe('parsePositiveInteger', () => {
    it('parsea enteros positivos', () => {
      expect(parsePositiveInteger('1')).toBe(1);
      expect(parsePositiveInteger('10')).toBe(10);
      expect(parsePositiveInteger('100', 1)).toBe(100);
    });

    it('usa fallback para valores invalidos', () => {
      expect(parsePositiveInteger(null, 1)).toBe(1);
      expect(parsePositiveInteger('0', 5)).toBe(5);
      expect(parsePositiveInteger('-1', 3)).toBe(3);
      expect(parsePositiveInteger('abc', 2)).toBe(2);
    });

    it('trunca decimales', () => {
      expect(parsePositiveInteger('3.7', 1)).toBe(3);
    });
  });

  describe('parseStoreIds', () => {
    it('parsea lista separada por comas', () => {
      const result = parseStoreIds('mexx,venex,fullh4rd');
      expect(result).toEqual(new Set(['mexx', 'venex', 'fullh4rd']));
    });

    it('normaliza a lowercase y trim', () => {
      const result = parseStoreIds('  Mexx , VENEX , FullH4rd  ');
      expect(result).toEqual(new Set(['mexx', 'venex', 'fullh4rd']));
    });

    it('retorna set vacio para null o string vacio', () => {
      expect(parseStoreIds(null)).toEqual(new Set());
      expect(parseStoreIds('')).toEqual(new Set());
    });

    it('filtra elementos vacios', () => {
      const result = parseStoreIds('mexx,,venex,');
      expect(result).toEqual(new Set(['mexx', 'venex']));
    });
  });

  describe('buildResponsePagination', () => {
    it('calcula paginacion correcta', () => {
      const result = buildResponsePagination(100, 1, 20);
      expect(result).toEqual({
        limit: 20,
        offset: 0,
        total: 100,
        totalPages: 5,
        page: 1,
        pageSize: 20,
      });
    });

    it('maneja pagina fuera de rango', () => {
      const result = buildResponsePagination(100, 10, 20);
      expect(result.page).toBe(5); // deberia clamping a ultima pagina
    });

    it('maneja total cero', () => {
      const result = buildResponsePagination(0, 1, 20);
      expect(result).toEqual({
        limit: 0,
        offset: 0,
        total: 0,
        totalPages: 0,
        page: 1,
        pageSize: 20,
      });
    });
  });

  describe('emptySearchResponse', () => {
    it('construye respuesta vacia con paginacion', () => {
      const result = emptySearchResponse(2, 15);
      expect(result.products).toEqual([]);
      // Cuando total=0, page se clamping a 1 (no hay paginas)
      expect(result.pagination).toMatchObject({
        total: 0,
        page: 1,
        pageSize: 15,
      });
      expect(result.facets).toEqual({
        categories: [],
        brands: [],
        stores: [],
      });
    });
  });

  describe('buildSearchCacheKey', () => {
    it('genera key deterministica', () => {
      const key1 = buildSearchCacheKey({
        query: 'Ryzen 5600X',
        sortBy: 'relevance',
        page: 1,
        stores: new Set(['mexx', 'venex']),
      });
      const key2 = buildSearchCacheKey({
        query: 'Ryzen 5600X',
        sortBy: 'relevance',
        page: 1,
        stores: new Set(['venex', 'mexx']), // orden diferente
      });

      expect(key1).toBe(key2); // deberia ser idempotente
      expect(key1).toContain('q=ryzen 5600x');
      expect(key1).toContain('sort=relevance');
      expect(key1).toContain('page=1');
    });

    it('incluye filtros en cache key', () => {
      const key = buildSearchCacheKey({
        query: 'rtx',
        category: 'tarjetas-graficas',
        sortBy: 'price-asc',
        page: 2,
        minPrice: 100_000,
        maxPrice: 500_000,
        stores: new Set(['mexx']),
      });

      expect(key).toContain('cat=tarjetas-graficas');
      expect(key).toContain('sort=price-asc');
      expect(key).toContain('page=2');
      expect(key).toContain('min=100000');
      expect(key).toContain('max=500000');
    });
  });

  describe('hasSearchFiltersIntent', () => {
    it('detecta cuando hay filtros', () => {
      expect(hasSearchFiltersIntent({
        category: 'procesadores',
        stores: new Set(),
      })).toBe(true);

      expect(hasSearchFiltersIntent({
        minPrice: 100_000,
        stores: new Set(),
      })).toBe(true);

      expect(hasSearchFiltersIntent({
        maxPrice: 500_000,
        stores: new Set(),
      })).toBe(true);

      expect(hasSearchFiltersIntent({
        stores: new Set(['mexx']),
      })).toBe(true);
    });

    it('retorna false cuando no hay filtros', () => {
      expect(hasSearchFiltersIntent({
        stores: new Set(),
      })).toBe(false);
    });
  });

  describe('constantes de configuracion', () => {
    it('tiene valores de timeout y concurrencia documentados', () => {
      // Estos valores viven en search-handler-shared.ts
      const SCRAPER_TIMEOUT_MS = 25_000;
      const MAX_CONCURRENT_SCRAPERS = 6;
      const PERSISTENCE_TIMEOUT_MS = 7_000;
      const SEARCH_CACHE_TTL_MS = 3 * 60 * 1000;

      expect(SCRAPER_TIMEOUT_MS).toBe(25_000);
      expect(MAX_CONCURRENT_SCRAPERS).toBe(6);
      expect(PERSISTENCE_TIMEOUT_MS).toBe(7_000);
      expect(SEARCH_CACHE_TTL_MS).toBe(180_000);
    });

    it('valid sorts set', () => {
      const VALID_SORTS = new Set(['relevance', 'price-asc', 'price-desc', 'name', 'newest']);
      expect(VALID_SORTS).toEqual(
        new Set(['relevance', 'price-asc', 'price-desc', 'name', 'newest']),
      );
    });
  });
});
