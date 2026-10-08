import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getServerSupabaseReadClientMock, requestMemo } = vi.hoisted(() => ({
  getServerSupabaseReadClientMock: vi.fn(),
  requestMemo: new Map<unknown, Map<string, unknown>>(),
}));

// Simula el alcance por request de React cache en Server Components.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <A extends unknown[], R>(fn: (...args: A) => R) => (...args: A): R => {
    const entries = requestMemo.get(fn) ?? new Map<string, unknown>();
    requestMemo.set(fn, entries);
    const key = JSON.stringify(args);
    if (!entries.has(key)) entries.set(key, fn(...args));
    return entries.get(key) as R;
  },
}));

vi.mock('@/lib/server/supabase-server', () => ({
  getServerSupabaseReadClient: getServerSupabaseReadClientMock,
}));

import { readCanonicalProductIdForProductId, readProductDetailByIdFromDatabase } from './product-read';

const baseRow = {
  id: 'mexx-ryzen-7600', name: 'AMD Ryzen 5 7600', category: 'procesadores', brand: 'AMD', model: 'Ryzen 5 7600',
  description: null, image: null, normalized_title: null, canonical_product_key: 'amd-ryzen-5-7600',
  family_key: null, variant_key: null, refresh_priority: null, last_scraped_at: null, last_normalized_at: null,
  specs: {}, lowest_price: 200_000, highest_price: 200_000, average_price: 200_000,
  created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-12T00:00:00.000Z',
  product_prices: [{ store_id: 'mexx', url: 'https://example.com/mexx', price: 200_000, original_price: null,
    stock: 'in-stock', installment_count: null, installment_amount: null, last_updated: '2026-09-12T00:00:00.000Z' }],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function mockSupabase() {
  const related = deferred<{ data: unknown; error: null }>();
  const canonical = deferred<{ data: unknown; error: null }>();
  const maybeSingle = vi.fn(async () => ({ data: baseRow, error: null }));
  const limits: number[] = [];
  const chain = {
    select: vi.fn(() => chain), eq: vi.fn(() => chain), like: vi.fn(() => chain), order: vi.fn(() => chain),
    maybeSingle,
    limit: vi.fn((count: number) => {
      limits.push(count);
      return count === 201 ? related.promise : canonical.promise;
    }),
  };
  getServerSupabaseReadClientMock.mockReturnValue({ from: vi.fn(() => chain) });
  return { related, canonical, maybeSingle, limits };
}

describe('lecturas por request de la ficha de producto', () => {
  beforeEach(() => {
    requestMemo.clear();
  });

  it('comparte la fila base y lanza ofertas relacionadas y agrupado canónico en paralelo', async () => {
    const { related, canonical, maybeSingle, limits } = mockSupabase();

    const detailRead = readProductDetailByIdFromDatabase(baseRow.id);
    const canonicalRead = readCanonicalProductIdForProductId(baseRow.id);
    await vi.waitFor(() => expect(limits.sort()).toEqual([20, 201]));

    expect(maybeSingle).toHaveBeenCalledTimes(1);
    related.resolve({ data: [baseRow], error: null });
    canonical.resolve({ data: [{ id: 'agrupado-procesadores-ryzen-7600', name: baseRow.name, category: 'procesadores' }], error: null });

    const [detail, canonicalId] = await Promise.all([detailRead, canonicalRead]);
    expect(detail).toMatchObject({ id: baseRow.id, canonicalProductKey: baseRow.canonical_product_key });
    expect(canonicalId).toBe('agrupado-procesadores-ryzen-7600');
  });

  it('metadata y página reutilizan el mismo resultado dentro de un request', async () => {
    const { related, canonical, maybeSingle, limits } = mockSupabase();
    related.resolve({ data: [baseRow], error: null });
    canonical.resolve({ data: [], error: null });

    const first = await readProductDetailByIdFromDatabase(baseRow.id);
    const second = await readProductDetailByIdFromDatabase(baseRow.id);
    expect(await readCanonicalProductIdForProductId(baseRow.id)).toBeNull();
    expect(await readCanonicalProductIdForProductId(baseRow.id)).toBeNull();

    expect(second).toBe(first);
    expect(maybeSingle).toHaveBeenCalledTimes(1);
    expect(limits.sort()).toEqual([20, 201]);
  });
});
