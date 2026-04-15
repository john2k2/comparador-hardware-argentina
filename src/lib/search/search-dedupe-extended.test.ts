import { describe, expect, it } from 'vitest';
import { filterProductStores, groupSearchProducts } from './search-dedupe';
import type { Product } from '@/lib/types';

function buildProduct(name: string, storeId: string, price = 100_000): Product {
  return {
    id: `${storeId}-${name.replace(/\s+/g, '-').toLowerCase()}`,
    name,
    category: 'procesadores',
    brand: name.split(' ')[0] || 'Generic',
    model: name,
    description: name,
    lowestPrice: price,
    highestPrice: price,
    averagePrice: price,
    prices: [
      {
        storeId,
        storeName: storeId.charAt(0).toUpperCase() + storeId.slice(1),
        url: `https://${storeId}.com/producto`,
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

describe('search-dedupe extended', () => {
  describe('filterProductStores', () => {
    it('filtra productos por tiendas seleccionadas', () => {
      const product = buildProduct('AMD Ryzen 5', 'mexx', 250_000);
      product.prices.push({
        storeId: 'venex',
        storeName: 'Venex',
        url: 'https://venex.com/producto',
        price: 260_000,
        stock: 'in-stock',
        installment: null,
        lastUpdated: new Date(),
      });

      const filtered = filterProductStores(product, new Set(['mexx']));

      expect(filtered).not.toBeNull();
      expect(filtered!.prices).toHaveLength(1);
      expect(filtered!.prices[0].storeId).toBe('mexx');
    });

    it('retorna null cuando no hay precios en tiendas seleccionadas', () => {
      const product = buildProduct('AMD Ryzen 5', 'mexx', 250_000);

      const filtered = filterProductStores(product, new Set(['venex']));

      expect(filtered).toBeNull();
    });

    it('mantiene todas las tiendas cuando selectedStoreIds esta vacio', () => {
      const product = buildProduct('AMD Ryzen 5', 'mexx', 250_000);
      product.prices.push({
        storeId: 'venex',
        storeName: 'Venex',
        url: 'https://venex.com/producto',
        price: 260_000,
        stock: 'in-stock',
        installment: null,
        lastUpdated: new Date(),
      });

      const filtered = filterProductStores(product, new Set());

      expect(filtered).not.toBeNull();
      expect(filtered!.prices).toHaveLength(2);
    });
  });

  describe('groupSearchProducts', () => {
    it('agrupa productos similares por nombre normalizado', () => {
      const products = [
        buildProduct('AMD Ryzen 5 5600X', 'mexx', 250_000),
        buildProduct('AMD Ryzen 5 5600X', 'venex', 260_000),
      ];

      const titleMap = new Map([
        ['AMD Ryzen 5 5600X', 'AMD Ryzen 5 5600X'],
      ]);

      const grouped = groupSearchProducts(
        products,
        titleMap,
        ['ryzen', '5600x'],
        'ryzen 5600x',
        'procesadores',
      );

      // Deberia agrupar en un solo producto con 2 tiendas
      expect(grouped.length).toBe(1);
      expect(grouped[0].prices.length).toBe(2);
    });

    it('mantiene productos diferentes separados', () => {
      const products = [
        buildProduct('AMD Ryzen 5 5600X', 'mexx', 250_000),
        buildProduct('Intel Core i5-12400F', 'mexx', 200_000),
      ];

      const titleMap = new Map([
        ['AMD Ryzen 5 5600X', 'AMD Ryzen 5 5600X'],
        ['Intel Core i5-12400F', 'Intel Core i5-12400F'],
      ]);

      const grouped = groupSearchProducts(
        products,
        titleMap,
        ['cpu'],
        'cpu',
        'procesadores',
      );

      expect(grouped.length).toBe(2);
    });

    it('maneja lista vacia', () => {
      const grouped = groupSearchProducts(
        [],
        new Map(),
        [],
        '',
        undefined,
      );

      expect(grouped).toEqual([]);
    });
  });
});
