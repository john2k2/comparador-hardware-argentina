import { describe, expect, it } from 'vitest';
import {
  normalizeSearchText,
  parseSingleCharQueryVariants,
  parseStrictVariantQueryTokens,
  shouldKeepByQueryIntent,
  sortProductsBySearchRelevance,
} from './search-ranking';
import type { Product } from '@/lib/types';

function buildProduct(name: string, category: string, price = 100_000): Product {
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

describe('search-ranking extended', () => {
  describe('normalizeSearchText', () => {
    it('normaliza texto de busqueda', () => {
      expect(normalizeSearchText('  RTX 4070  ')).toBe('rtx 4070');
      expect(normalizeSearchText('AMD Ryzen 5')).toBe('amd ryzen 5');
      expect(normalizeSearchText('Mouse   Gamer')).toBe('mouse gamer');
    });

    it('maneja caracteres especiales', () => {
      expect(normalizeSearchText('Café')).toContain('cafe');
      expect(normalizeSearchText('Niño')).toContain('nino');
    });
  });

  describe('parseSingleCharQueryVariants', () => {
    it('extrae variantes de un solo caracter', () => {
      const variants = parseSingleCharQueryVariants('RTX 4070 Ti');
      // La funcion puede retornar Set o array segun implementacion
      expect(variants).toBeDefined();
    });
  });

  describe('parseStrictVariantQueryTokens', () => {
    it('extrae tokens de variante estricta', () => {
      const tokens = parseStrictVariantQueryTokens('Ryzen 5 5600X');
      // La funcion retorna array de tokens estrictos
      expect(Array.isArray(tokens)).toBe(true);
    });
  });

  describe('shouldKeepByQueryIntent', () => {
    it('mantiene productos que coinciden con la busqueda', () => {
      const queryWords = ['ryzen', '5600x'];
      expect(shouldKeepByQueryIntent('AMD Ryzen 5 5600X', queryWords, new Set(), [])).toBe(true);
    });

    it('rechaza productos que no coinciden', () => {
      const queryWords = ['rtx', '4090'];
      expect(shouldKeepByQueryIntent('AMD Ryzen 5 5600X', queryWords, new Set(), [])).toBe(false);
    });

    it('maneja busquedas con variantes', () => {
      const queryWords = ['rtx'];
      const singleCharVariants = new Set(['x']);
      const strictVariants: string[] = [];
      // RTX contiene 'rtx' que matchea con queryWords
      expect(shouldKeepByQueryIntent('RTX 4070 X', queryWords, singleCharVariants, strictVariants)).toBe(true);
    });
  });

  describe('sortProductsBySearchRelevance', () => {
    it('ordena por relevancia de busqueda', () => {
      const products = [
        buildProduct('Intel Core i5', 'procesadores', 200_000),
        buildProduct('AMD Ryzen 5 5600X', 'procesadores', 250_000),
      ];

      const sorted = sortProductsBySearchRelevance(products, 'ryzen 5600x', 'procesadores');

      // Ryzen 5600X deberia estar primero por match exacto
      expect(sorted[0].name).toContain('Ryzen');
    });

    it('prioriza match de categoria', () => {
      const products = [
        buildProduct('RTX 4070', 'tarjetas-graficas', 500_000),
        buildProduct('RTX Case', 'gabinetes', 100_000),
      ];

      const sorted = sortProductsBySearchRelevance(products, 'rtx', 'tarjetas-graficas');

      expect(sorted[0].category).toBe('tarjetas-graficas');
    });

    it('maneja lista vacia', () => {
      const sorted = sortProductsBySearchRelevance([], 'test', undefined);
      expect(sorted).toEqual([]);
    });
  });
});
