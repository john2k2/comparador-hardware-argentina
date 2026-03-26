import { describe, expect, it } from 'vitest';
import { runWithConcurrency, selectStoresByIds } from './multi-store';

const stores = [
  { id: 'mexx', name: 'Mexx' },
  { id: 'venex', name: 'Venex' },
  { id: 'compragamer', name: 'CompraGamer' },
];

describe('scraper multi-store helpers', () => {
  it('filters stores by normalized ids and keeps all stores when ids are empty', () => {
    expect(selectStoresByIds(stores, [' VEnex ', 'mexx'])).toEqual([
      stores[0],
      stores[1],
    ]);
    expect(selectStoresByIds(stores, [])).toEqual(stores);
  });

  it('runs work with bounded concurrency preserving result order', async () => {
    const seen: number[] = [];
    const results = await runWithConcurrency([3, 1, 2], 2, async (value) => {
      seen.push(value);
      return value * 10;
    });

    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(results).toEqual([30, 10, 20]);
  });
});
