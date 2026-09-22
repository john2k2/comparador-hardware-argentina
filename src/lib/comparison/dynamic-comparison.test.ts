import { describe, expect, it } from 'vitest';
import type { HardwareCategory, Product } from '@/lib/types';
import { compareProducts } from './dynamic-comparison';

function product(id: string, price: number, specs: Record<string, string> = {}, category: HardwareCategory = 'procesadores'): Product {
  const now = new Date('2026-09-22T00:00:00.000Z');
  return {
    id, name: id, category, brand: 'Marca', model: id, specs,
    prices: [{ storeId: 'store', storeName: 'Store', url: 'https://store.example/product', price, stock: 'in-stock', installment: null, lastUpdated: now }],
    lowestPrice: price, highestPrice: price, averagePrice: price, createdAt: now, updatedAt: now,
  };
}

describe('compareProducts', () => {
  it('calcula diferencia de precio sin convertirla en benchmark', () => {
    const result = compareProducts(product('Ryzen A', 100_000), product('Ryzen B', 125_000));
    expect(result.cheaperProductId).toBe('Ryzen A');
    expect(result.difference).toBe(25_000);
    expect(result.differencePercent).toBe(25);
    expect(result.recommendation).toContain('no prueba mejor rendimiento por peso');
  });

  it('expone diferencias de plataforma para CPUs', () => {
    const result = compareProducts(product('CPU A', 100_000, { socket: 'AM4' }), product('CPU B', 120_000, { socket: 'AM5' }));
    expect(result.evidence.join(' ')).toContain('sockets distintos');
    expect(result.specificationRows).toContainEqual({ label: 'Socket', left: 'AM4', right: 'AM5' });
  });

  it('ignora ofertas pendientes de validar identidad', () => {
    const left = product('GPU A', 100_000, {}, 'tarjetas-graficas');
    left.prices[0].identityReview = { status: 'pending', confidence: 0.2, reasons: ['modelo dudoso'] };
    const result = compareProducts(left, product('GPU B', 120_000, {}, 'tarjetas-graficas'));
    expect(result.leftPrice).toBeNull();
    expect(result.cheaperProductId).toBeNull();
  });
});
