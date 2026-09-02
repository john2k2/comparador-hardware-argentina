import { describe, expect, it } from 'vitest';
import { buildPriceIndexSnapshot, normalizePriceIndexDays } from './model';

describe('price index model', () => {
  it('coerces database values and establishes a base 100 per category', () => {
    const snapshot = buildPriceIndexSnapshot([
      { day: '2026-06-01', category: 'procesadores', median_price_ars: '200000.00', product_count: '4', offer_count: 7 },
      { day: '2026-06-08', category: 'procesadores', median_price_ars: 220000, product_count: 5, offer_count: '9' },
    ]);

    expect(snapshot.status).toBe('ready');
    expect(snapshot.series[0]?.points).toEqual([
      expect.objectContaining({ date: '2026-06-01', medianPriceArs: 200000, index: 100, productCount: 4, offerCount: 7 }),
      expect.objectContaining({ date: '2026-06-08', medianPriceArs: 220000, index: 110, productCount: 5, offerCount: 9 }),
    ]);
    expect(snapshot.series[0]?.variations.days7).toBeCloseTo(10);
  });

  it('uses the last observation on or before each comparison date when there are gaps', () => {
    const snapshot = buildPriceIndexSnapshot([
      { day: '2026-05-01', category: 'memoria-ram', median_price_ars: 100, product_count: 1, offer_count: 2 },
      { day: '2026-05-10', category: 'memoria-ram', median_price_ars: 120, product_count: 1, offer_count: 2 },
      { day: '2026-05-31', category: 'memoria-ram', median_price_ars: 150, product_count: 1, offer_count: 2 },
    ]);

    expect(snapshot.series[0]?.variations.days7).toBeCloseTo(25);
    expect(snapshot.series[0]?.variations.days30).toBeCloseTo(50);
    expect(snapshot.series[0]?.variations.days90).toBeNull();
  });

  it('accepts timestamp-shaped day values from PostgREST', () => {
    const snapshot = buildPriceIndexSnapshot([
      { day: '2026-06-01T00:00:00+00:00', category: 'procesadores', median_price_ars: 200000, product_count: 4, offer_count: 7 },
    ]);

    expect(snapshot.status).toBe('ready');
    expect(snapshot.series[0]?.points[0]?.date).toBe('2026-06-01');
  });

  it('drops malformed rows and returns an explicit empty state without invented figures', () => {
    const snapshot = buildPriceIndexSnapshot([
      { day: 'not-a-date', category: 'procesadores', median_price_ars: 'x', product_count: 0, offer_count: 0 },
      { day: '2026-06-01', category: 'otra', median_price_ars: 100, product_count: 1, offer_count: 1 },
    ]);

    expect(snapshot).toEqual(expect.objectContaining({ status: 'empty', series: [], updatedAt: null }));
  });

  it('keeps the supported request window between 7 and 365 days', () => {
    expect(normalizePriceIndexDays(2)).toBe(7);
    expect(normalizePriceIndexDays(90)).toBe(90);
    expect(normalizePriceIndexDays(999)).toBe(365);
    expect(normalizePriceIndexDays(Number.NaN)).toBe(90);
  });
});
