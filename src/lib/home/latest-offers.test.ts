import { describe, expect, it } from 'vitest';
import type { Product, ProductPrice } from '@/lib/types';
import { pickLatestOfferProducts } from './latest-offers';

const now = new Date('2026-10-03T01:00:00Z').getTime();
const hour = 60 * 60 * 1000;

function offer(ageHours: number, changes: Partial<ProductPrice> = {}): ProductPrice {
  return {
    storeId: 'mexx', storeName: 'Mexx', url: 'https://www.mexx.com.ar/producto/ryzen-5600',
    price: 200_000, stock: 'in-stock', installment: null, lastUpdated: new Date(now - ageHours * hour),
    ...changes,
  };
}

function product(id: string, prices: ProductPrice[], updatedAt = new Date(now)): Product {
  return {
    id, name: 'AMD Ryzen 5 5600', category: 'procesadores', brand: 'AMD', model: 'Ryzen 5 5600',
    specs: {}, prices, lowestPrice: 1, highestPrice: 999_999, averagePrice: 1,
    createdAt: updatedAt, updatedAt,
  };
}

describe('últimas ofertas de portada', () => {
  it('ordena por lectura real de una oferta y no por edición de la ficha', () => {
    const older = product('older-offer', [offer(2)], new Date(now));
    const newer = product('newer-offer', [offer(0.5)], new Date(now - 72 * hour));
    expect(pickLatestOfferProducts([older, newer], 4, now).map((entry) => entry.id))
      .toEqual(['newer-offer', 'older-offer']);
  });

  it('no rellena la sección con referencias viejas, agotadas o de stock desconocido', () => {
    const unusable = [
      product('stale', [offer(3.01)]), product('out', [offer(0, { stock: 'out-of-stock' })]),
      product('unknown', [offer(0, { stock: 'unknown' })]), product('zero', [offer(0, { price: 0 })]),
      product('invalid-date', [offer(0, { lastUpdated: new Date(NaN) })]),
      product('future', [offer(-1)]), product('no-url', [offer(0, { url: '' })]),
      product('invalid-store', [offer(0, { url: 'https://example.com/5600' })]),
    ];
    expect(pickLatestOfferProducts(unusable, 4, now)).toEqual([]);
  });

  it('una contradicción explícita de modelo impide promover el precio', () => {
    const conflict = offer(0, { sourceIdentity: { listingRef: 'mexx:5600', title: 'AMD Ryzen 7 5700X' } });
    expect(pickLatestOfferProducts([product('conflict', [conflict])], 4, now)).toEqual([]);
  });

  it('no promueve altas que no sean hardware reconocido o tengan una categoría contradictoria', () => {
    const unrelated = { ...product('lock', [offer(0)]), name: 'CERRADURA INTELIGENTE EZVIZ DL05' };
    const wrongCategory = { ...product('wrong-category', [offer(0)]), category: 'motherboards' as const };
    expect(pickLatestOfferProducts([unrelated, wrongCategory], 4, now)).toEqual([]);
    expect(unrelated.prices).toHaveLength(1);
  });

  it('calcula el precio visible sólo con ofertas aceptadas recientes y no altera el catálogo', () => {
    const recent = offer(1, { price: 210_000 });
    const lowStock = offer(2, { storeId: 'maximus', storeName: 'Maximus',
      url: 'https://www.maximus.com.ar/Producto/ryzen-5600/ITEM=123/maximus.aspx', price: 220_000, stock: 'low-stock' });
    const source = product('mixed', [offer(5, { price: 10_000 }), recent, lowStock]);
    const [result] = pickLatestOfferProducts([source], 4, now);
    expect(result.prices).toEqual([recent, lowStock]);
    expect([result.lowestPrice, result.highestPrice, result.averagePrice]).toEqual([210_000, 220_000, 215_000]);
    expect(source.prices).toHaveLength(3);
    expect(source.lowestPrice).toBe(1);
    expect(result.updatedAt).toBe(source.updatedAt);
    expect(result.prices[0].lastUpdated).toBe(recent.lastUpdated);
  });

  it('respeta el límite y una lectura posterior no prolonga tres horas de vigencia', () => {
    const source = [product('one', [offer(2.99)]), product('two', [offer(2.98)])];
    expect(pickLatestOfferProducts(source, 1, now).map((entry) => entry.id)).toEqual(['two']);
    expect(pickLatestOfferProducts(source, 4, now + 0.1 * hour)).toEqual([]);
    expect(pickLatestOfferProducts(source, 0, now)).toEqual([]);
  });

  it('elige primero categorías distintas aunque el último lote sea de memorias de una familia', () => {
    const ram = (id: string, capacity: number, age: number): Product => ({ ...product(id, [offer(age)]),
      name: `SODIMM DDR4 ${capacity}GB MEMOX 3200MHz`, category: 'memoria-ram', brand: 'MEMOX', model: 'SODIMM' });
    const cpu = product('cpu', [offer(1)]);
    const board = { ...product('board', [offer(1.5)]), name: 'Motherboard MSI PRO B650M-B', category: 'motherboards' as const };
    const selected = pickLatestOfferProducts([ram('32gb', 32, 0), ram('16gb', 16, 0.1), ram('8gb', 8, 0.2), cpu, board], 4, now);
    expect(selected.map(({ id }) => id)).toEqual(['32gb', 'cpu', 'board']);
    expect(selected[0].name).toContain('32GB');
  });

  it('completa con otra familia sin duplicar IDs ni modificar la identidad persistida', () => {
    const first = { ...product('cpu-a', [offer(0)]), familyKey: 'cpu-family' };
    const sibling = { ...product('cpu-b', [offer(0.1)]), familyKey: 'cpu-family' };
    const distinct = { ...product('cpu-c', [offer(1)]), familyKey: 'another-family' };
    const duplicate = { ...first, familyKey: 'another-mapped-family' };
    expect(pickLatestOfferProducts([first, duplicate, sibling, distinct], 4, now).map(({ id }) => id)).toEqual(['cpu-a', 'cpu-c']);
    expect(sibling.familyKey).toBe('cpu-family');
  });
});
