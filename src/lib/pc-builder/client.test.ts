import { describe, expect, it } from 'vitest';
import type { Product } from '@/lib/types';
import { mergeRetriedCatalog } from './client';

function product(id: string, observed = '2026-10-09T10:00:00Z'): Product {
  return { id, name: id, category: 'procesadores', brand: '', model: '', specs: {},
    lowestPrice: 100_000, highestPrice: 100_000, averagePrice: 100_000,
    createdAt: new Date(observed), updatedAt: new Date(observed), prices: [{ storeId: 'store', storeName: 'Store',
      url: `https://store.example/${id}`, price: 100_000, stock: 'in-stock', lastUpdated: new Date(observed), installment: null }] };
}

describe('recuperación de catálogos concurrente', () => {
  it('un reintento diferido conserva productos encontrados mientras esperaba', async () => {
    const before = [product('cpu')];
    let current = before;
    let finish!: (products: Product[]) => void;
    const request = new Promise<Product[]>((resolve) => { finish = resolve; });
    const retry = request.then((recovered) => { current = mergeRetriedCatalog(current, before, recovered); });
    current = [...current, product('found-psu')];
    finish([product('gpu')]);
    await retry;
    expect(current.map(({ id }) => id)).toEqual(['cpu', 'found-psu', 'gpu']);
  });
  it('conserva observaciones y retiros de una restauración o lectura posterior', () => {
    const before = [product('cpu'), product('removed')];
    const newer = product('cpu', '2026-10-09T11:00:00Z');
    const current = [newer, product('new-selection')];
    const merged = mergeRetriedCatalog(current, before, [product('cpu'), product('removed'), product('gpu')]);
    expect(merged.map(({ id }) => id)).toEqual(['cpu', 'new-selection', 'gpu']);
    expect(merged[0]).toBe(newer);
    expect(merged[0].prices[0].lastUpdated.toISOString()).toBe('2026-10-09T11:00:00.000Z');
  });
  it('renueva una fila que no cambió durante el reintento', () => {
    const before = [product('cpu')];
    const recovered = product('cpu', '2026-10-09T11:00:00Z');
    expect(mergeRetriedCatalog(before, before, [recovered])).toEqual([recovered]);
  });
});
