import { describe, expect, it } from 'vitest';
import { parseCatalogInterest } from './analytics-interest';

const now = new Date('2026-10-15T12:00:00.000Z');

function payload(overrides: Record<string, unknown> = {}) {
  return {
    periodStart: '2026-10-03',
    periodEnd: '2026-10-10',
    products: [
      { productId: 'gpu-rtx-5060', viewUsers: 12, outboundUsers: 3 },
      { productId: 'cpu.ryzen-7600', viewUsers: 8, outboundUsers: 2 },
    ],
    ...overrides,
  };
}

describe('parseCatalogInterest', () => {
  it('acepta dos agregados con counts enteros y conserva IDs exactos', () => {
    const parsed = parseCatalogInterest(payload(), now);

    expect(parsed).toHaveLength(2);
    expect(parsed.map((item) => ({
      product_id: item.product_id,
      view_users: item.view_users,
      outbound_users: item.outbound_users,
      period_start: item.period_start,
      period_end: item.period_end,
    }))).toEqual([
      {
        product_id: 'gpu-rtx-5060',
        view_users: 12,
        outbound_users: 3,
        period_start: '2026-10-03',
        period_end: '2026-10-10',
      },
      {
        product_id: 'cpu.ryzen-7600',
        view_users: 8,
        outbound_users: 2,
        period_start: '2026-10-03',
        period_end: '2026-10-10',
      },
    ]);
    expect(parsed[0]?.imported_at).toBe(now.toISOString());
    expect(parsed[0]?.expires_at).toBe(new Date(now.getTime() + 8 * 86400000).toISOString());
  });

  it('acepta como maximo 1000 productos y rechaza IDs duplicados', () => {
    const products = Array.from({ length: 1000 }, (_, index) => ({
      productId: `product-${index}`,
      viewUsers: index,
      outboundUsers: Math.floor(index / 2),
    }));

    expect(parseCatalogInterest(payload({ products }), now)).toHaveLength(1000);
    expect(() => parseCatalogInterest(payload({ products: [products[0], products[0]] }), now))
      .toThrow('REFRESH_INVALID_PRODUCT');
    expect(() => parseCatalogInterest(payload({ products: [...products, { productId: 'overflow', viewUsers: 1, outboundUsers: 1 }] }), now))
      .toThrow('REFRESH_INVALID_INTEREST');
  });

  it('rechaza NaN, negativos e IDs con caracteres invalidos', () => {
    expect(() => parseCatalogInterest(payload({ products: [{ productId: 'gpu', viewUsers: Number.NaN, outboundUsers: 1 }] }), now))
      .toThrow('REFRESH_INVALID_COUNTS');
    expect(() => parseCatalogInterest(payload({ products: [{ productId: 'gpu', viewUsers: -1, outboundUsers: 1 }] }), now))
      .toThrow('REFRESH_INVALID_COUNTS');
    expect(() => parseCatalogInterest(payload({ products: [{ productId: 'gpu/5060', viewUsers: 1, outboundUsers: 1 }] }), now))
      .toThrow('REFRESH_INVALID_PRODUCT');
  });

  it('rechaza periodos invalidos, antiguos o demasiado largos', () => {
    expect(parseCatalogInterest(payload({ periodStart: '2026-10-03', periodEnd: '2026-10-31' }), new Date('2026-11-01T00:00:00.000Z')))
      .toHaveLength(2);
    expect(parseCatalogInterest(payload({ periodStart: '2026-10-03', periodEnd: '2026-10-03' }), new Date('2026-10-17T00:00:00.000Z')))
      .toHaveLength(2);
    expect(() => parseCatalogInterest(payload({ periodStart: '2026-10-02' }), now))
      .toThrow('REFRESH_INVALID_PERIOD');
    expect(() => parseCatalogInterest(payload({ periodStart: '2026-10-03', periodEnd: '2026-10-15' }), now))
      .toThrow('REFRESH_INVALID_PERIOD');
    expect(() => parseCatalogInterest(payload({ periodStart: '2026-10-03', periodEnd: '2026-11-01' }), new Date('2026-11-02T00:00:00.000Z')))
      .toThrow('REFRESH_INVALID_PERIOD');
    expect(() => parseCatalogInterest(payload({ periodStart: '2026-10-03', periodEnd: '2026-10-03' }), new Date('2026-10-20T00:00:00.000Z')))
      .toThrow('REFRESH_INVALID_PERIOD');
  });
});
