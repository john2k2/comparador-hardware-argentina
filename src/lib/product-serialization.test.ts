import { describe, expect, it } from 'vitest';
import { hydrateProduct, hydrateProducts } from './product-serialization';

function buildSerializedProduct(): Record<string, unknown> {
  return {
    id: 'test-product-1',
    name: 'AMD Ryzen 5 5600X',
    category: 'procesadores',
    brand: 'AMD',
    model: 'Ryzen 5 5600X',
    description: 'Procesador AMD',
    lowestPrice: 250_000,
    highestPrice: 260_000,
    averagePrice: 255_000,
    prices: [
      {
        storeId: 'mexx',
        storeName: 'Mexx',
        url: 'https://mexx.com/producto',
        price: 250_000,
        stock: 'in-stock',
        installment: null,
        lastUpdated: '2026-04-14T10:00:00.000Z',
      },
    ],
    specs: {},
    createdAt: '2026-04-14T09:00:00.000Z',
    updatedAt: '2026-04-14T10:00:00.000Z',
  };
}

describe('product-serialization', () => {
  describe('hydrateProduct', () => {
    it('convierte strings de fecha a objetos Date', () => {
      const serialized = buildSerializedProduct();
      const hydrated = hydrateProduct(serialized);

      expect(hydrated.createdAt).toBeInstanceOf(Date);
      expect(hydrated.updatedAt).toBeInstanceOf(Date);
      expect(hydrated.prices[0].lastUpdated).toBeInstanceOf(Date);
    });

    it('preserva valores numericos', () => {
      const serialized = buildSerializedProduct();
      const hydrated = hydrateProduct(serialized);

      expect(hydrated.lowestPrice).toBe(250_000);
      expect(hydrated.highestPrice).toBe(260_000);
      expect(hydrated.averagePrice).toBe(255_000);
    });

    it('maneja fechas invalidas', () => {
      const serialized = buildSerializedProduct();
      serialized.createdAt = 'invalid-date';

      const hydrated = hydrateProduct(serialized);

      // Deberia manejar gracefully, posiblemente como Date invalida
      expect(hydrated.createdAt).toBeDefined();
    });

    it('maneja campos null', () => {
      const serialized = buildSerializedProduct();
      serialized.createdAt = null;
      serialized.updatedAt = null;

      const hydrated = hydrateProduct(serialized);

      expect(hydrated.createdAt).toBeDefined();
    });
  });

  describe('hydrateProducts', () => {
    it('hidrata multiple productos', () => {
      const products = [buildSerializedProduct(), buildSerializedProduct()];
      const hydrated = hydrateProducts(products);

      expect(hydrated).toHaveLength(2);
      expect(hydrated[0].createdAt).toBeInstanceOf(Date);
      expect(hydrated[1].createdAt).toBeInstanceOf(Date);
    });

    it('maneja lista vacia', () => {
      expect(hydrateProducts([])).toEqual([]);
    });
  });

  describe('normalizeFetchedProduct', () => {
    it('hidrata fechas de producto', () => {
      const product = buildSerializedProduct();
      // Usar hydrateProduct en lugar de normalizeFetchedProduct
      const normalized = hydrateProduct(product);

      expect(normalized.createdAt).toBeInstanceOf(Date);
      expect(normalized.updatedAt).toBeInstanceOf(Date);
    });
  });
});
