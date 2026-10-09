import { describe, expect, it } from 'vitest';
import { getStableFixtureProducts } from './stable-search-fixtures';

describe('búsqueda con catálogo E2E estable', () => {
  it('limita las ofertas a la tienda elegida y conserva el catálogo original al quitar el filtro', () => {
    const filtered = getStableFixtureProducts({ query: 'ryzen 5600', selectedStoreIds: new Set(['venex']) });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].prices.map(offer => offer.storeId)).toEqual(['venex']);
    expect(filtered[0].lowestPrice).toBe(189999);
    expect(filtered[0].highestPrice).toBe(189999);
    expect(filtered[0].averagePrice).toBe(189999);
    const restored = getStableFixtureProducts({ query: 'ryzen 5600' });
    expect(restored[0].prices).toHaveLength(2);
    expect(restored[0].lowestPrice).toBe(185000);
  });

  it('aplica el máximo al precio de la tienda seleccionada, no al de otra tienda más barata', () => {
    expect(getStableFixtureProducts({ query: 'ryzen 5600', selectedStoreIds: new Set(['venex']), maxPrice: 188000 })).toEqual([]);
    expect(getStableFixtureProducts({ query: 'ryzen 5600', selectedStoreIds: new Set(['mexx']), maxPrice: 188000 })).toHaveLength(1);
  });

  it('una tienda sin ofertas devuelve vacío', () => {
    expect(getStableFixtureProducts({ selectedStoreIds: new Set(['tienda-inexistente']) })).toEqual([]);
  });
});
