import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getServerSupabaseServiceClientMock } = vi.hoisted(() => ({
  getServerSupabaseServiceClientMock: vi.fn(),
}));

vi.mock('@/lib/server/supabase-server', () => ({
  getServerSupabaseServiceClient: getServerSupabaseServiceClientMock,
}));

import { checkProductsHealth, cleanupZeroPriceProducts } from './product-cleanup';
import { CLEANUP_REASON_NO_VALID_PRICE } from './product-cleanup-selection';

type Result = { data: unknown[] | null; error: { message: string } | null };
type Respond = (table: string, calls: string[], range: [number, number] | null) => Result;

function buildClient(respond: Respond) {
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];

  const client = {
    from(table: string) {
      const calls: string[] = [];
      let range: [number, number] | null = null;
      let pendingPatch: Record<string, unknown> | null = null;
      let updateId: string | null = null;

      const builder: Record<string, unknown> = {
        select() { calls.push('select'); return builder; },
        like() { calls.push('like'); return builder; },
        gt() { calls.push('gt'); return builder; },
        or() { calls.push('or'); return builder; },
        update(patch: Record<string, unknown>) {
          calls.push('update');
          pendingPatch = patch;
          return builder;
        },
        eq(_column: string, value: string) {
          calls.push('eq');
          updateId = value;
          return builder;
        },
        range(from: number, to: number) {
          calls.push('range');
          range = [from, to];
          return builder;
        },
        then(resolve: (value: Result) => unknown) {
          if (pendingPatch && updateId) {
            updates.push({ id: updateId, patch: pendingPatch });
          }
          return Promise.resolve(respond(table, calls, range)).then(resolve);
        },
      };

      return builder;
    },
  };

  return { client, updates };
}

function page(rows: unknown[]): Result {
  return { data: rows, error: null };
}

beforeEach(() => {
  getServerSupabaseServiceClientMock.mockReset();
});

describe('cleanupZeroPriceProducts', () => {
  it('encuentra los productos sin ninguna oferta con precio válido', async () => {
    const { client, updates } = buildClient((table, calls) => {
      if (table === 'product_prices') return page([{ product_id: 'agrupado-a' }]);
      if (calls.includes('or')) return page([]);
      return page([
        { id: 'agrupado-a', name: 'Con oferta' },
        { id: 'agrupado-b', name: 'Sin oferta' },
      ]);
    });
    getServerSupabaseServiceClientMock.mockReturnValue(client);

    const result = await cleanupZeroPriceProducts();

    expect(result.cleaned).toBe(1);
    expect(result.details).toEqual([
      { id: 'agrupado-b', name: 'Sin oferta', reason: CLEANUP_REASON_NO_VALID_PRICE },
    ]);
    expect(updates).toEqual([
      { id: 'agrupado-b', patch: expect.objectContaining({ is_indexable: false }) },
    ]);
  });

  it('no marca nada cuando cada producto tiene una oferta válida', async () => {
    const { client, updates } = buildClient((table, calls) => {
      if (table === 'product_prices') return page([{ product_id: 'agrupado-a' }]);
      if (calls.includes('or')) return page([]);
      return page([{ id: 'agrupado-a', name: 'Con oferta' }]);
    });
    getServerSupabaseServiceClientMock.mockReturnValue(client);

    await expect(cleanupZeroPriceProducts()).resolves.toMatchObject({ cleaned: 0 });
    expect(updates).toEqual([]);
  });

  it('propaga el error de lectura en lugar de tragárselo y limpiar de menos', async () => {
    const { client } = buildClient((table) => (
      table === 'product_prices'
        ? { data: null, error: { message: 'boom' } }
        : page([])
    ));
    getServerSupabaseServiceClientMock.mockReturnValue(client);

    await expect(cleanupZeroPriceProducts()).rejects.toThrow(/product_prices.*boom/);
  });

  it('propaga el error de escritura al marcar como no indexable', async () => {
    const { client } = buildClient((table, calls) => {
      if (calls.includes('update')) return { data: null, error: { message: 'denied' } };
      if (table === 'product_prices') return page([]);
      if (calls.includes('or')) return page([]);
      return page([{ id: 'agrupado-b', name: 'Sin oferta' }]);
    });
    getServerSupabaseServiceClientMock.mockReturnValue(client);

    await expect(cleanupZeroPriceProducts()).rejects.toThrow(/agrupado-b.*denied/);
  });

  it('pagina más allá del tope de una sola respuesta de PostgREST', async () => {
    const priced = Array.from({ length: 1000 }, (_, i) => ({ product_id: `agrupado-${i}` }));
    const { client } = buildClient((table, calls, range) => {
      if (table === 'product_prices') {
        return page(range && range[0] === 0 ? priced : [{ product_id: 'agrupado-1000' }]);
      }
      if (calls.includes('or')) return page([]);
      return page([{ id: 'agrupado-1000', name: 'En la segunda página' }]);
    });
    getServerSupabaseServiceClientMock.mockReturnValue(client);

    // Sin paginar, agrupado-1000 caería fuera de la primera página y se
    // marcaría como sin ofertas pese a tener una.
    await expect(cleanupZeroPriceProducts()).resolves.toMatchObject({ cleaned: 0 });
  });

  it('falla claro cuando Supabase no está disponible', async () => {
    getServerSupabaseServiceClientMock.mockReturnValue(null);
    await expect(cleanupZeroPriceProducts()).rejects.toThrow('Supabase no disponible');
  });
});

describe('checkProductsHealth', () => {
  it('reporta conteos consistentes con la limpieza', async () => {
    const { client } = buildClient((table, calls) => {
      if (table === 'product_prices') return page([{ product_id: 'agrupado-a' }]);
      if (calls.includes('or')) return page([]);
      return page([
        { id: 'agrupado-a', name: 'Con oferta' },
        { id: 'agrupado-b', name: 'Sin oferta' },
      ]);
    });
    getServerSupabaseServiceClientMock.mockReturnValue(client);

    await expect(checkProductsHealth()).resolves.toEqual({
      totalProducts: 2,
      withZeroPrice: 0,
      withoutStores: 1,
      withPrices: 1,
      healthy: 1,
    });
  });
});
