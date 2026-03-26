import { describe, expect, it } from 'vitest';
import { sanitizeProduct } from '@/lib/product-sanitizer';
import type { Product } from '@/lib/types';

function buildProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'gpu-1',
    name: '  ASUS RTX 5070 Ti  ',
    category: 'tarjetas-graficas',
    brand: ' ASUS ',
    model: ' RTX 5070 Ti ',
    description: '  GPU gamer  ',
    image: 'https://cdn.example.com/gpu.webp',
    specs: { ' Memoria ': ' 16 GB ' },
    prices: [
      {
        storeId: 'venex',
        storeName: ' Venex ',
        url: ' https://venex.com.ar/gpu ',
        price: 1_250_000,
        installment: null,
        stock: 'in-stock',
        lastUpdated: new Date('2026-03-26T12:00:00.000Z'),
      },
      {
        storeId: 'compugarden',
        storeName: ' Compugarden ',
        url: ' https://compugarden.com.ar/gpu ',
        price: 24_849_611,
        installment: null,
        stock: 'in-stock',
        lastUpdated: new Date('2026-03-26T12:00:00.000Z'),
      },
    ],
    lowestPrice: 0,
    highestPrice: 0,
    averagePrice: 0,
    createdAt: new Date('2026-03-26T12:00:00.000Z'),
    updatedAt: new Date('2026-03-26T12:00:00.000Z'),
    ...overrides,
  };
}

describe('product-sanitizer', () => {
  it('normaliza texto y recalcula stats comparables sin outliers absurdos', () => {
    const sanitized = sanitizeProduct(buildProduct());

    expect(sanitized.name).toBe('ASUS RTX 5070 Ti');
    expect(sanitized.brand).toBe('ASUS');
    expect(sanitized.specs).toEqual({ Memoria: '16 GB' });
    expect(sanitized.prices).toHaveLength(1);
    expect(sanitized.prices[0].storeId).toBe('venex');
    expect(sanitized.lowestPrice).toBe(1_250_000);
    expect(sanitized.highestPrice).toBe(1_250_000);
    expect(sanitized.averagePrice).toBe(1_250_000);
  });

  it('descarta precios invalidos y conserva stats previos si no quedan precios comparables', () => {
    const sanitized = sanitizeProduct(buildProduct({
      prices: [
        {
          storeId: 'venex',
          storeName: 'Venex',
          url: 'https://venex.com.ar/gpu',
          price: 0,
          installment: null,
          stock: 'in-stock',
          lastUpdated: new Date('2026-03-26T12:00:00.000Z'),
        },
      ],
      lowestPrice: 999_999,
      highestPrice: 999_999,
      averagePrice: 999_999,
    }));

    expect(sanitized.prices).toEqual([]);
    expect(sanitized.lowestPrice).toBe(999_999);
    expect(sanitized.highestPrice).toBe(999_999);
    expect(sanitized.averagePrice).toBe(999_999);
  });
});
