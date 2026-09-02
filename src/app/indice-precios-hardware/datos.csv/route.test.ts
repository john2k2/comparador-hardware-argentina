import { beforeEach, describe, expect, it, vi } from 'vitest';

const getHardwarePriceIndex = vi.fn();
vi.mock('@/lib/price-index/server', () => ({ getHardwarePriceIndex }));

describe('price index CSV route', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exports only aggregate public columns with correct escaping and six-hour caching', async () => {
    getHardwarePriceIndex.mockResolvedValue({
      status: 'ready',
      updatedAt: '2026-06-01T00:00:00.000Z',
      coverage: null,
      series: [{
        id: 'procesadores',
        label: 'Procesadores, CPU',
        variations: { days7: null, days30: null, days90: null },
        points: [{ date: '2026-06-01', index: 100, medianPriceArs: 200000, productCount: 4, offerCount: 7 }],
      }],
    });
    const { GET } = await import('./route');
    const response = await GET();
    const csv = await response.text();

    expect(csv).toBe('fecha,categoria,indice,precio_mediano_ars,productos,ofertas\n2026-06-01,"Procesadores, CPU",100.00,200000.00,4,7\n');
    expect(csv).not.toContain('product_id');
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(response.headers.get('cache-control')).toContain('s-maxage=21600');
  });
});
