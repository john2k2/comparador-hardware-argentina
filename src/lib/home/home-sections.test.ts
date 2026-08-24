import { describe, expect, it } from 'vitest';
import { resolveBaselineFromHistory } from './price-drop-baseline';

describe('resolveBaselineFromHistory', () => {
  it('ignora precios posteriores al precio actual', () => {
    const current = {
      product: {} as never,
      storeId: 'mexx',
      currentPrice: 100_000,
      currentUpdatedAtMs: new Date('2026-08-20T12:00:00Z').getTime(),
    };

    expect(resolveBaselineFromHistory([
      { price: 130_000, recordedAtMs: new Date('2026-08-21T12:00:00Z').getTime() },
    ], current)).toBeNull();
  });

  it('usa un precio más caro únicamente cuando es anterior', () => {
    const current = {
      product: {} as never,
      storeId: 'mexx',
      currentPrice: 100_000,
      currentUpdatedAtMs: new Date('2026-08-20T12:00:00Z').getTime(),
    };

    expect(resolveBaselineFromHistory([
      { price: 130_000, recordedAtMs: new Date('2026-08-19T12:00:00Z').getTime() },
    ], current)).toBe(130_000);
  });
});
