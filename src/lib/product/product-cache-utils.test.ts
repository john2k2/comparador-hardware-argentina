import { describe, expect, it } from 'vitest';
import type { Product } from '@/lib/types';
import {
  normalizeFetchedProduct,
  resolveInitialProductClientState,
  setCachedProduct,
} from './product-cache-utils';

function buildProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'gpu-1',
    name: 'ASUS RTX 5070 Ti',
    category: 'tarjetas-graficas',
    brand: 'ASUS',
    model: 'RTX 5070 Ti',
    description: 'GPU de prueba',
    image: 'https://cdn.example.com/gpu.webp',
    specs: {},
    prices: [
      {
        storeId: 'venex',
        storeName: 'Venex',
        url: 'https://venex.com.ar/gpu',
        price: 1_250_000,
        installment: null,
        stock: 'in-stock',
        lastUpdated: '2026-03-26T12:00:00.000Z' as unknown as Date,
      },
    ],
    lowestPrice: 1_250_000,
    highestPrice: 1_250_000,
    averagePrice: 1_250_000,
    createdAt: '2026-03-26T12:00:00.000Z' as unknown as Date,
    updatedAt: '2026-03-26T12:00:00.000Z' as unknown as Date,
    ...overrides,
  };
}

describe('product-cache-utils', () => {
  it('hidrata fechas de un producto serializado', () => {
    const normalized = normalizeFetchedProduct(buildProduct());

    expect(normalized.createdAt).toBeInstanceOf(Date);
    expect(normalized.updatedAt).toBeInstanceOf(Date);
    expect(normalized.prices[0].lastUpdated).toBeInstanceOf(Date);
  });

  it('reutiliza cache en memoria antes que el fallback inicial', () => {
    const cachedProduct = normalizeFetchedProduct(buildProduct({ id: 'gpu-cached' }));
    setCachedProduct('gpu-cached', cachedProduct);

    const resolved = resolveInitialProductClientState('gpu-cached', null);

    expect(resolved.shouldFetch).toBe(false);
    expect(resolved.isLoading).toBe(false);
    expect(resolved.product?.id).toBe('gpu-cached');
  });

  it('usa el producto inicial cuando no hay cache cliente', () => {
    const resolved = resolveInitialProductClientState('gpu-initial', buildProduct({ id: 'gpu-initial' }));

    // When initialProduct is provided from SSR, we should NOT refetch
    // to avoid unnecessary network requests and hydration mismatches.
    expect(resolved.shouldFetch).toBe(false);
    expect(resolved.isLoading).toBe(false);
    expect(resolved.product?.id).toBe('gpu-initial');
    expect(resolved.product?.createdAt).toBeInstanceOf(Date);
  });
});
