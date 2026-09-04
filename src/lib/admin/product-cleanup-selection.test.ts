import { describe, expect, it } from 'vitest';
import {
  CLEANUP_REASON_NO_VALID_PRICE,
  CLEANUP_REASON_ZERO_AGGREGATE,
  selectProductsToDeindex,
  summarizeProductsHealth,
} from './product-cleanup-selection';

const grouped = [
  { id: 'agrupado-a', name: 'Producto A' },
  { id: 'agrupado-b', name: 'Producto B' },
  { id: 'agrupado-c', name: 'Producto C' },
];

describe('selectProductsToDeindex', () => {
  it('marca los productos sin ninguna oferta con precio válido', () => {
    const selected = selectProductsToDeindex({
      groupedProducts: grouped,
      pricedProductIds: ['agrupado-a'],
      zeroPriceProductIds: [],
    });

    expect(selected).toEqual([
      { id: 'agrupado-b', name: 'Producto B', reason: CLEANUP_REASON_NO_VALID_PRICE },
      { id: 'agrupado-c', name: 'Producto C', reason: CLEANUP_REASON_NO_VALID_PRICE },
    ]);
  });

  it('marca el agregado en $0 aunque el producto tenga ofertas válidas', () => {
    const selected = selectProductsToDeindex({
      groupedProducts: grouped,
      pricedProductIds: ['agrupado-a', 'agrupado-b', 'agrupado-c'],
      zeroPriceProductIds: ['agrupado-b'],
    });

    expect(selected).toEqual([
      { id: 'agrupado-b', name: 'Producto B', reason: CLEANUP_REASON_ZERO_AGGREGATE },
    ]);
  });

  it('reporta un solo motivo por producto y prioriza la falta de oferta', () => {
    const selected = selectProductsToDeindex({
      groupedProducts: grouped,
      pricedProductIds: [],
      zeroPriceProductIds: ['agrupado-a', 'agrupado-b', 'agrupado-c'],
    });

    expect(selected.map((entry) => entry.id)).toEqual(['agrupado-a', 'agrupado-b', 'agrupado-c']);
    expect(selected.every((entry) => entry.reason === CLEANUP_REASON_NO_VALID_PRICE)).toBe(true);
  });

  it('no marca nada cuando todo está sano', () => {
    expect(selectProductsToDeindex({
      groupedProducts: grouped,
      pricedProductIds: ['agrupado-a', 'agrupado-b', 'agrupado-c'],
      zeroPriceProductIds: [],
    })).toEqual([]);
  });

  it('nunca devuelve el mismo producto dos veces', () => {
    const selected = selectProductsToDeindex({
      groupedProducts: [...grouped, { id: 'agrupado-a', name: 'Producto A' }],
      pricedProductIds: [],
      zeroPriceProductIds: ['agrupado-a'],
    });

    expect(selected.filter((entry) => entry.id === 'agrupado-a')).toHaveLength(1);
  });

  it('usa un nombre legible cuando el producto no tiene nombre', () => {
    const selected = selectProductsToDeindex({
      groupedProducts: [{ id: 'agrupado-x', name: null }],
      pricedProductIds: [],
      zeroPriceProductIds: [],
    });

    expect(selected[0].name).toBe('Sin nombre');
  });
});

describe('summarizeProductsHealth', () => {
  it('cuenta sanos, sin oferta y agregados en $0 sin solaparlos', () => {
    expect(summarizeProductsHealth({
      groupedProducts: grouped,
      pricedProductIds: ['agrupado-a', 'agrupado-b'],
      zeroPriceProductIds: ['agrupado-b'],
    })).toEqual({
      totalProducts: 3,
      withoutStores: 1,
      withZeroPrice: 1,
      withPrices: 2,
      healthy: 1,
    });
  });

  it('nunca reporta un conteo de sanos negativo', () => {
    const health = summarizeProductsHealth({
      groupedProducts: grouped,
      pricedProductIds: [],
      zeroPriceProductIds: ['agrupado-a', 'agrupado-b', 'agrupado-c'],
    });

    expect(health.healthy).toBe(0);
    expect(health.withoutStores).toBe(3);
  });

  it('los tres conteos suman el total', () => {
    const health = summarizeProductsHealth({
      groupedProducts: grouped,
      pricedProductIds: ['agrupado-a', 'agrupado-b'],
      zeroPriceProductIds: ['agrupado-b'],
    });

    expect(health.healthy + health.withoutStores + health.withZeroPrice).toBe(health.totalProducts);
  });
});
