import { describe, expect, it } from 'vitest';
import type { Product } from '@/lib/types';
import { COMPARISON_SELECTION_TTL_MS, decodeComparisonSelection, encodeComparisonSelection, recoverComparisonProduct } from './selection-recovery';

const now = Date.parse('2026-10-06T18:00:00Z');
const selection = { category: 'procesadores' as const, useCase: 'gaming' as const, leftId: 'cpu-a', rightId: 'cpu-b' };
function snapshot(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({ version: 1, savedAt: now, ...selection, ...overrides });
}

describe('comparison selection recovery', () => {
  it('round trips complete and partial selections, including two null sides', () => {
    for (const ids of [{ leftId: 'cpu-a', rightId: 'cpu-b' }, { leftId: null, rightId: 'cpu-b' }, { leftId: null, rightId: null }]) {
      const value = { ...selection, ...ids };
      expect(decodeComparisonSelection(encodeComparisonSelection(value, now), now)).toEqual(value);
    }
  });

  it('expires at the bounded TTL without extending the snapshot on reading', () => {
    const raw = encodeComparisonSelection(selection, now);
    expect(decodeComparisonSelection(raw, now + COMPARISON_SELECTION_TTL_MS)).toEqual(selection);
    expect(decodeComparisonSelection(raw, now + COMPARISON_SELECTION_TTL_MS + 1)).toBeNull();
    expect(JSON.parse(raw!).savedAt).toBe(now);
  });

  it.each([
    { version: 2 }, { category: 'other' }, { useCase: 'other' },
    { leftId: '' }, { rightId: 42 }, { leftId: 'a/b' }, { leftId: 'a?refresh=1' },
    { leftId: 'a'.repeat(201) }, { rightId: ' cpu-b ' },
    { savedAt: 0 }, { savedAt: '2026-10-06' }, { savedAt: now + 120_000 },
  ])('rejects invalid context, identifiers or dates: %j', (invalid) => {
    expect(decodeComparisonSelection(snapshot(invalid), now)).toBeNull();
  });

  it.each([null, '', 'broken', 'null', '[]', '{}', 'a'.repeat(2_001)])('rejects malformed storage: %s', (raw) => {
    expect(decodeComparisonSelection(raw, now)).toBeNull();
  });

  it('requires both ID fields and finite selection dates', () => {
    const value = JSON.parse(snapshot());
    delete value.leftId;
    expect(decodeComparisonSelection(JSON.stringify(value), now)).toBeNull();
    expect(encodeComparisonSelection(selection, NaN)).toBeNull();
    expect(decodeComparisonSelection(snapshot(), Infinity)).toBeNull();
    expect(encodeComparisonSelection({ ...selection, leftId: '/invalid' }, now)).toBeNull();
  });

  it('persists only IDs and context even when the input contains product and offer data', () => {
    const input = { ...selection, left: { prices: [{ price: 1, stock: 'in-stock', lastUpdated: '2030-01-01' }] },
      model: 'invented', lowestPrice: 1, lastUpdated: '2030-01-01' };
    const raw = encodeComparisonSelection(input, now)!;
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual(['category', 'leftId', 'rightId', 'savedAt', 'useCase', 'version']);
    expect(raw).not.toMatch(/price|stock|lastUpdated|model|2030/);
    expect(decodeComparisonSelection(snapshot({ prices: [] }), now)).toEqual(selection);
  });

  it('hydrates only the requested ID and category while preserving observation dates', () => {
    const payload = { id: 'cpu-a', name: 'AMD Ryzen 7 7800X3D', category: 'procesadores', specs: {},
      prices: [{ storeId: 'test', price: 100_000, stock: 'unknown', lastUpdated: '2026-09-01T00:00:00Z' }],
      createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' };
    const result = recoverComparisonProduct(payload, 'cpu-a', 'procesadores')!;
    expect(result.prices[0].lastUpdated.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(result.prices[0].stock).toBe('unknown');
    expect(recoverComparisonProduct(payload, 'cpu-b', 'procesadores')).toBeNull();
    expect(recoverComparisonProduct(payload, 'cpu-a', 'tarjetas-graficas')).toBeNull();
    expect(recoverComparisonProduct(null, 'cpu-a', 'procesadores')).toBeNull();
    expect(recoverComparisonProduct({ ...payload, prices: [null] } as unknown as Product, 'cpu-a', 'procesadores')).toBeNull();
    expect(payload.prices[0].lastUpdated).toBe('2026-09-01T00:00:00Z');
  });
});
