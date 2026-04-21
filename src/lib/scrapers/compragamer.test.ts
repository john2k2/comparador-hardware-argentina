import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchCompraGamerProducts,
  searchCompraGamerProducts,
} from './compragamer';
import * as compragamerCatalog from './compragamer-catalog';
import type { HardwareCategory } from '../types';

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockCatalogItem = {
  id_producto: 12345,
  nombre: 'Procesador AMD Ryzen 7 5800X',
  precioEspecial: '89999',
  precioLista: '99999',
  stock: 5,
  vendible: 1,
  id_subcategoria: 1,
  id_marca: 1,
  codigo_principal: ['SKU-RYZEN5800X'],
  garantia: 36,
  imagenes: [{ nombre: 'ryzen5800x.jpg' }],
};

const mockCatalog = [mockCatalogItem];
const mockSubcategoryMap = new Map<number, HardwareCategory>([[1, 'procesadores']]);
const mockBrandMap = new Map([[1, 'AMD']]);

describe('compragamer scraper', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchCompraGamerProducts', () => {
    it('returns empty array when catalog is empty', async () => {
      vi.spyOn(compragamerCatalog, 'getCompraGamerCatalog').mockResolvedValue([]);
      vi.spyOn(compragamerCatalog, 'getCompraGamerSubcategoryMap').mockResolvedValue(new Map());
      vi.spyOn(compragamerCatalog, 'getCompraGamerBrandMap').mockResolvedValue(new Map());

      const result = await fetchCompraGamerProducts(1, 'procesadores');
      expect(result).toEqual([]);
    });

    it('filters products by category correctly', async () => {
      vi.spyOn(compragamerCatalog, 'getCompraGamerCatalog').mockResolvedValue(mockCatalog);
      vi.spyOn(compragamerCatalog, 'getCompraGamerSubcategoryMap').mockResolvedValue(mockSubcategoryMap);
      vi.spyOn(compragamerCatalog, 'getCompraGamerBrandMap').mockResolvedValue(mockBrandMap);

      const result = await fetchCompraGamerProducts(1, 'procesadores');

      expect(result).toHaveLength(1);
      expect(result[0]?.category).toBe('procesadores');
    });

    it('excludes products from different category', async () => {
      const differentCategoryItem = {
        ...mockCatalogItem,
        id_producto: 99999,
        id_subcategoria: 2,
      };
      const diffSubcategoryMap = new Map<number, HardwareCategory>([[2, 'tarjetas-graficas']]);
      vi.spyOn(compragamerCatalog, 'getCompraGamerCatalog').mockResolvedValue([differentCategoryItem]);
      vi.spyOn(compragamerCatalog, 'getCompraGamerSubcategoryMap').mockResolvedValue(diffSubcategoryMap);
      vi.spyOn(compragamerCatalog, 'getCompraGamerBrandMap').mockResolvedValue(mockBrandMap);

      const result = await fetchCompraGamerProducts(2, 'tarjetas-graficas');
      expect(result).toHaveLength(1);
      expect(result[0]?.category).toBe('tarjetas-graficas');
    });

    it('returns empty array when lookup fails', async () => {
      vi.spyOn(compragamerCatalog, 'getCompraGamerCatalog').mockRejectedValue(new Error('Network error'));

      const result = await fetchCompraGamerProducts(1, 'procesadores');
      expect(result).toEqual([]);
    });

    it('deduplicates products by id', async () => {
      const duplicateItem = { ...mockCatalogItem, id_producto: 12345 };
      vi.spyOn(compragamerCatalog, 'getCompraGamerCatalog').mockResolvedValue([mockCatalogItem, duplicateItem]);
      vi.spyOn(compragamerCatalog, 'getCompraGamerSubcategoryMap').mockResolvedValue(mockSubcategoryMap);
      vi.spyOn(compragamerCatalog, 'getCompraGamerBrandMap').mockResolvedValue(mockBrandMap);

      const result = await fetchCompraGamerProducts(1, 'procesadores');
      expect(result).toHaveLength(1);
    });
  });

  describe('searchCompraGamerProducts', () => {
    it('returns empty array for empty query', async () => {
      const result = await searchCompraGamerProducts('');
      expect(result).toEqual([]);
    });

    it('returns empty array for whitespace-only query', async () => {
      const result = await searchCompraGamerProducts('   ');
      expect(result).toEqual([]);
    });

    it('filters products by query matching', async () => {
      vi.spyOn(compragamerCatalog, 'getCompraGamerCatalog').mockResolvedValue(mockCatalog);
      vi.spyOn(compragamerCatalog, 'getCompraGamerSubcategoryMap').mockResolvedValue(mockSubcategoryMap);
      vi.spyOn(compragamerCatalog, 'getCompraGamerBrandMap').mockResolvedValue(mockBrandMap);

      const result = await searchCompraGamerProducts('ryzen 5800x');
      expect(result.length).toBeGreaterThan(0);
    });

    it('returns empty array when no matches found', async () => {
      const nonMatchingItem = {
        ...mockCatalogItem,
        id_producto: 99999,
        nombre: 'Procesador Intel i9',
      };
      const intelSubcategoryMap = new Map<number, HardwareCategory>([[1, 'procesadores']]);
      const intelBrandMap = new Map([[1, 'Intel']]);
      vi.spyOn(compragamerCatalog, 'getCompraGamerCatalog').mockResolvedValue([nonMatchingItem]);
      vi.spyOn(compragamerCatalog, 'getCompraGamerSubcategoryMap').mockResolvedValue(intelSubcategoryMap);
      vi.spyOn(compragamerCatalog, 'getCompraGamerBrandMap').mockResolvedValue(intelBrandMap);

      const result = await searchCompraGamerProducts('ryzen');
      expect(result).toEqual([]);
    });

    it('returns empty array when lookup fails', async () => {
      vi.spyOn(compragamerCatalog, 'getCompraGamerCatalog').mockRejectedValue(new Error('Network error'));

      const result = await searchCompraGamerProducts('ryzen');
      expect(result).toEqual([]);
    });

    it('matches products by id as well as name', async () => {
      vi.spyOn(compragamerCatalog, 'getCompraGamerCatalog').mockResolvedValue(mockCatalog);
      vi.spyOn(compragamerCatalog, 'getCompraGamerSubcategoryMap').mockResolvedValue(mockSubcategoryMap);
      vi.spyOn(compragamerCatalog, 'getCompraGamerBrandMap').mockResolvedValue(mockBrandMap);

      const result = await searchCompraGamerProducts('12345');
      expect(result.length).toBeGreaterThan(0);
    });
  });
});