import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  getServerClient: vi.fn(),
  priceUpsert: vi.fn(),
  productUpsert: vi.fn(),
  historyInsert: vi.fn(),
  loggerWarn: vi.fn(),
}));
vi.mock('@/lib/server/supabase-server', () => ({
  getServerSupabaseServiceClient: mocks.getServerClient,
}));
vi.mock('@/lib/catalog/catalog-metadata', () => ({ buildCatalogMetadata: async (products: Product[]) => products }));
vi.mock('@/lib/persistence/stale-product-prices-maintenance', () => ({ deleteProductPriceIdentities: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { warn: mocks.loggerWarn } }));

import { persistProductsSnapshot } from './product-catalog';

function createServiceClient() {
  return {
    from: (table: string) => ({
      select: () => ({ in: () => table === 'price_alerts'
        ? { eq: async () => ({ data: [], error: null }) }
        : Promise.resolve({ data: table === 'stores' ? [{ id: 'mexx' }] : [], error: null }) }),
      upsert: table === 'product_prices' ? mocks.priceUpsert : mocks.productUpsert,
      insert: mocks.historyInsert,
    }),
  };
}

function product(withReview = true): Product {
  const name = 'AMD Ryzen 5 5600';
  const url = 'https://www.mexx.com.ar/amd-ryzen-5-5600';
  const observed = new Date('2026-09-21T12:00:00Z');
  return {
    id: 'cpu-5600', name, model: name, brand: 'AMD', category: 'procesadores', specs: {},
    prices: [{ storeId: 'mexx', storeName: 'Mexx', price: 250_000, stock: 'in-stock', url, installment: null, lastUpdated: observed,
      ...(withReview ? { identityReview: { version: 1 as const, status: 'needs-review' as const, reason: 'low-confidence' as const, reviewedAt: observed.toISOString(), model: 'jev-1.13.0', confidence: 0.4, subject: { name: 'amd ryzen 5 5600', category: 'procesadores', url } } } : {}),
    }],
    lowestPrice: 250_000, highestPrice: 250_000, averagePrice: 250_000, createdAt: observed, updatedAt: observed,
  };
}

describe('persistencia de revisión de ofertas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerClient.mockImplementation(createServiceClient);
    mocks.priceUpsert.mockResolvedValue({ error: null });
    mocks.productUpsert.mockResolvedValue({ error: null });
    mocks.historyInsert.mockResolvedValue({ error: null });
  });

  it('escribe identidad separada del precio y conserva last_updated de la tienda', async () => {
    const source = product();
    await persistProductsSnapshot([source]);
    const row = mocks.priceUpsert.mock.calls[0][0][0];
    expect(row.identity_review).toEqual(source.prices[0].identityReview);
    expect(row.last_updated).toBe('2026-09-21T12:00:00.000Z');
    expect(mocks.historyInsert.mock.calls[0][0][0]).not.toHaveProperty('identity_review');
  });

  it('preserva la actualización del catálogo si todavía falta la columna aditiva', async () => {
    mocks.priceUpsert.mockResolvedValueOnce({ error: { code: 'PGRST204', message: "Could not find the identity_review column" } });
    await persistProductsSnapshot([product()]);
    expect(mocks.priceUpsert).toHaveBeenCalledTimes(2);
    expect(mocks.priceUpsert.mock.calls[1][0][0]).not.toHaveProperty('identity_review');
    expect(mocks.loggerWarn).toHaveBeenCalled();
    expect(mocks.historyInsert).toHaveBeenCalledTimes(1);
  });

  it('separa filas revisadas y no revisadas para no borrar revisiones previas por columnas ausentes', async () => {
    const unreviewed = product(false);
    unreviewed.id = 'cpu-5600-second';
    await persistProductsSnapshot([product(), unreviewed]);
    expect(mocks.priceUpsert).toHaveBeenCalledTimes(2);
    expect(mocks.priceUpsert.mock.calls[0][0]).toHaveLength(1);
    expect(mocks.priceUpsert.mock.calls[0][0][0]).toHaveProperty('identity_review');
    expect(mocks.priceUpsert.mock.calls[1][0]).toHaveLength(1);
    expect(mocks.priceUpsert.mock.calls[1][0][0]).not.toHaveProperty('identity_review');
  });

  it('sin revisión no exige la columna y no oculta otros errores de persistencia', async () => {
    await persistProductsSnapshot([product(false)]);
    expect(mocks.priceUpsert.mock.calls[0][0][0]).not.toHaveProperty('identity_review');
    mocks.priceUpsert.mockResolvedValueOnce({ error: { code: '42501', message: 'permission denied' } });
    await expect(persistProductsSnapshot([product()])).rejects.toThrow('permission denied');
    expect(mocks.priceUpsert).toHaveBeenCalledTimes(2);
  });

  it('falla en refresh requerido si faltan credenciales de servicio y mantiene no-op legado', async () => {
    mocks.getServerClient.mockReturnValue(null);

    await expect(persistProductsSnapshot([product()], { requirePersistence: true }))
      .rejects.toThrow('Catalog refresh requires Supabase service credentials');
    await expect(persistProductsSnapshot([product()], { requirePersistence: false })).resolves.toBeUndefined();
    expect(mocks.priceUpsert).not.toHaveBeenCalled();
  });
});
