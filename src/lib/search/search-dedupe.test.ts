import { describe, expect, it } from 'vitest';
import {
  dedupeNearDuplicates,
  filterProductStores,
  groupSearchProducts,
} from './search-dedupe';
import type { HardwareCategory, Product } from '@/lib/types';

function buildProduct(
  name: string,
  options?: Partial<Product> & { category?: HardwareCategory; lowestPrice?: number },
): Product {
  const lowestPrice = options?.lowestPrice ?? 100_000;
  const updatedAt = options?.updatedAt ?? new Date('2026-03-06T12:00:00.000Z');

  return {
    id: options?.id ?? name.toLowerCase().replace(/\s+/g, '-'),
    name,
    category: options?.category ?? 'perifericos',
    brand: options?.brand ?? 'Test',
    model: options?.model ?? name,
    description: options?.description ?? name,
    image: options?.image ?? '/pixel-box.svg',
    normalizedTitle: options?.normalizedTitle,
    canonicalProductKey: options?.canonicalProductKey,
    familyKey: options?.familyKey,
    variantKey: options?.variantKey,
    refreshPriority: options?.refreshPriority,
    lastScrapedAt: options?.lastScrapedAt,
    lastNormalizedAt: options?.lastNormalizedAt ?? null,
    specs: options?.specs ?? {},
    prices: options?.prices ?? [
      {
        storeId: 'test-store',
        storeName: 'Test Store',
        url: 'https://example.com/product',
        price: lowestPrice,
        stock: 'in-stock',
        installment: null,
        lastUpdated: updatedAt,
      },
    ],
    lowestPrice,
    highestPrice: options?.highestPrice ?? lowestPrice,
    averagePrice: options?.averagePrice ?? lowestPrice,
    createdAt: options?.createdAt ?? updatedAt,
    updatedAt,
  };
}

describe('search-dedupe', () => {
  describe('dedupeNearDuplicates', () => {
    it('retorna el mismo array si hay 0 o 1 producto', () => {
      const empty: Product[] = [];
      expect(dedupeNearDuplicates(empty)).toEqual([]);

      const single = [buildProduct('Mouse Logitech G502')];
      expect(dedupeNearDuplicates(single)).toEqual(single);
    });

    it('mergea productos con misma tienda y mismo precio', () => {
      const productA = buildProduct('Placa de Video ASUS RTX 4060 8GB', {
        category: 'tarjetas-graficas',
        brand: 'ASUS',
        lowestPrice: 500_000,
        prices: [
          {
            storeId: 'mexx',
            storeName: 'Mexx',
            url: 'https://mexx.com/rtx4060',
            price: 500_000,
            stock: 'in-stock',
            installment: null,
            lastUpdated: new Date('2026-03-06T12:00:00.000Z'),
          },
        ],
      });

      const productB = buildProduct('ASUS GeForce RTX 4060 Dual OC 8GB GDDR6', {
        category: 'tarjetas-graficas',
        brand: 'ASUS',
        lowestPrice: 500_000,
        prices: [
          {
            storeId: 'mexx',
            storeName: 'Mexx',
            url: 'https://mexx.com/rtx4060-dual',
            price: 500_000,
            stock: 'in-stock',
            installment: null,
            lastUpdated: new Date('2026-03-06T12:00:00.000Z'),
          },
        ],
      });

      const result = dedupeNearDuplicates([productA, productB]);
      expect(result).toHaveLength(1);
      expect(result[0].prices).toHaveLength(1);
    });

    it('no mergea productos de categorias distintas', () => {
      const productA = buildProduct('Mouse Logitech G502', { category: 'perifericos' });
      const productB = buildProduct('Mouse Logitech G502', { category: 'gabinetes' });

      const result = dedupeNearDuplicates([productA, productB]);
      expect(result).toHaveLength(2);
    });

    it('no mergea productos con chips distintos', () => {
      const productA = buildProduct('ASUS RTX 4060 Ti 8GB', {
        category: 'tarjetas-graficas',
        brand: 'ASUS',
        lowestPrice: 600_000,
        prices: [
          {
            storeId: 'mexx',
            storeName: 'Mexx',
            url: 'https://mexx.com/rtx4060ti',
            price: 600_000,
            stock: 'in-stock',
            installment: null,
            lastUpdated: new Date('2026-03-06T12:00:00.000Z'),
          },
        ],
      });

      const productB = buildProduct('ASUS RTX 4070 12GB', {
        category: 'tarjetas-graficas',
        brand: 'ASUS',
        lowestPrice: 800_000,
        prices: [
          {
            storeId: 'mexx',
            storeName: 'Mexx',
            url: 'https://mexx.com/rtx4070',
            price: 800_000,
            stock: 'in-stock',
            installment: null,
            lastUpdated: new Date('2026-03-06T12:00:00.000Z'),
          },
        ],
      });

      const result = dedupeNearDuplicates([productA, productB]);
      expect(result).toHaveLength(2);
    });

    it('mantiene productos sin tienda ni precio en comun', () => {
      const productA = buildProduct('Mouse Logitech G502', {
        lowestPrice: 100_000,
        prices: [
          {
            storeId: 'mexx',
            storeName: 'Mexx',
            url: 'https://mexx.com/g502',
            price: 100_000,
            stock: 'in-stock',
            installment: null,
            lastUpdated: new Date('2026-03-06T12:00:00.000Z'),
          },
        ],
      });

      const productB = buildProduct('Mouse Logitech G502 X', {
        lowestPrice: 120_000,
        prices: [
          {
            storeId: 'venex',
            storeName: 'Venex',
            url: 'https://venex.com/g502x',
            price: 120_000,
            stock: 'in-stock',
            installment: null,
            lastUpdated: new Date('2026-03-06T12:00:00.000Z'),
          },
        ],
      });

      const result = dedupeNearDuplicates([productA, productB]);
      expect(result).toHaveLength(2);
    });
  });

  describe('filterProductStores', () => {
    it('retorna el producto completo si no hay filtros', () => {
      const product = buildProduct('Mouse Logitech G502', {
        lowestPrice: 100_000,
        prices: [
          {
            storeId: 'mexx',
            storeName: 'Mexx',
            url: 'https://mexx.com/g502',
            price: 100_000,
            stock: 'in-stock',
            installment: null,
            lastUpdated: new Date('2026-03-06T12:00:00.000Z'),
          },
          {
            storeId: 'venex',
            storeName: 'Venex',
            url: 'https://venex.com/g502',
            price: 110_000,
            stock: 'in-stock',
            installment: null,
            lastUpdated: new Date('2026-03-06T12:00:00.000Z'),
          },
        ],
      });

      const result = filterProductStores(product, new Set());
      expect(result).not.toBeNull();
      expect(result!.prices).toHaveLength(2);
    });

    it('filtra solo las tiendas seleccionadas', () => {
      const product = buildProduct('Mouse Logitech G502', {
        lowestPrice: 100_000,
        prices: [
          {
            storeId: 'mexx',
            storeName: 'Mexx',
            url: 'https://mexx.com/g502',
            price: 100_000,
            stock: 'in-stock',
            installment: null,
            lastUpdated: new Date('2026-03-06T12:00:00.000Z'),
          },
          {
            storeId: 'venex',
            storeName: 'Venex',
            url: 'https://venex.com/g502',
            price: 110_000,
            stock: 'in-stock',
            installment: null,
            lastUpdated: new Date('2026-03-06T12:00:00.000Z'),
          },
        ],
      });

      const result = filterProductStores(product, new Set(['mexx']));
      expect(result).not.toBeNull();
      expect(result!.prices).toHaveLength(1);
      expect(result!.prices[0].storeId).toBe('mexx');
    });

    it('retorna null si no quedan precios tras el filtro', () => {
      const product = buildProduct('Mouse Logitech G502', {
        lowestPrice: 100_000,
        prices: [
          {
            storeId: 'mexx',
            storeName: 'Mexx',
            url: 'https://mexx.com/g502',
            price: 100_000,
            stock: 'in-stock',
            installment: null,
            lastUpdated: new Date('2026-03-06T12:00:00.000Z'),
          },
        ],
      });

      const result = filterProductStores(product, new Set(['tienda-inexistente']));
      expect(result).toBeNull();
    });
  });

  describe('groupSearchProducts', () => {
    it('agrupa productos con mismo nombre normalizado', () => {
      const normalizedTitles = new Map<string, string>();
      normalizedTitles.set('ASUS RTX 4060 8GB', 'asus rtx 4060 8gb');
      normalizedTitles.set('ASUS GeForce RTX 4060 Dual 8GB', 'asus rtx 4060 8gb');

      const products = [
        buildProduct('ASUS RTX 4060 8GB', {
          category: 'tarjetas-graficas',
          brand: 'ASUS',
          lowestPrice: 500_000,
          prices: [
            {
              storeId: 'mexx',
              storeName: 'Mexx',
              url: 'https://mexx.com/rtx4060',
              price: 500_000,
              stock: 'in-stock',
              installment: null,
              lastUpdated: new Date('2026-03-06T12:00:00.000Z'),
            },
          ],
        }),
        buildProduct('ASUS GeForce RTX 4060 Dual 8GB', {
          category: 'tarjetas-graficas',
          brand: 'ASUS',
          lowestPrice: 510_000,
          prices: [
            {
              storeId: 'venex',
              storeName: 'Venex',
              url: 'https://venex.com/rtx4060-dual',
              price: 510_000,
              stock: 'in-stock',
              installment: null,
              lastUpdated: new Date('2026-03-06T12:00:00.000Z'),
            },
          ],
        }),
      ];

      const result = groupSearchProducts(
        products,
        normalizedTitles,
        ['rtx', '4060'],
        'rtx 4060',
        'tarjetas-graficas',
      );

      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('maneja lista vacia', () => {
      const result = groupSearchProducts([], new Map(), [], '');
      expect(result).toEqual([]);
    });
  });
});
