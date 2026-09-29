import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  getServerClient: vi.fn(),
  rpc: vi.fn(),
  priceUpsert: vi.fn(),
  productUpsert: vi.fn(),
  historyInsert: vi.fn(),
}));
vi.mock('@/lib/server/supabase-server', () => ({
  getServerSupabaseServiceClient: mocks.getServerClient,
}));
vi.mock('@/lib/catalog/catalog-metadata', () => ({ buildCatalogMetadata: async (products: Product[]) => products }));
vi.mock('@/lib/persistence/stale-product-prices-maintenance', () => ({ deleteProductPriceIdentities: vi.fn() }));

import { persistProductsSnapshot } from './product-catalog';

function createServiceClient(persistedProducts: Array<Record<string, unknown>> = []) {
  return {
    rpc: mocks.rpc,
    from: (table: string) => ({
      select: () => ({ in: () => table === 'price_alerts'
        ? { eq: async () => ({ data: [], error: null }) }
        : Promise.resolve({ data: table === 'stores' ? [{ id: 'mexx' }] : table === 'products' ? persistedProducts : [], error: null }) }),
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
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-29T15:00:00Z'));
    mocks.getServerClient.mockImplementation(createServiceClient);
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.priceUpsert.mockResolvedValue({ error: null });
    mocks.productUpsert.mockResolvedValue({ error: null });
    mocks.historyInsert.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends reviewed and unreviewed offers in one RPC batch with their actual observation times', async () => {
    const source = product();
    const unreviewed = { ...product(false), id: 'cpu-5600-second' };
    unreviewed.prices[0].lastUpdated = new Date('2026-09-22T13:00:00Z');
    await persistProductsSnapshot([source, unreviewed]);

    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('persist_catalog_offers', {
      p_offers: [
        {
          product_id: source.id, store_id: 'mexx', url: source.prices[0].url,
          price: 250_000, original_price: null, stock: 'in-stock',
          installment_count: null, installment_amount: null,
          identity_review: source.prices[0].identityReview,
          last_updated: '2026-09-21T12:00:00.000Z',
          updated_at: '2026-09-29T15:00:00.000Z', state_signature: expect.any(String),
        },
        {
          product_id: unreviewed.id, store_id: 'mexx', url: unreviewed.prices[0].url,
          price: 250_000, original_price: null, stock: 'in-stock',
          installment_count: null, installment_amount: null,
          last_updated: '2026-09-22T13:00:00.000Z',
          updated_at: '2026-09-29T15:00:00.000Z', state_signature: expect.any(String),
        },
      ],
    });
    expect(mocks.rpc.mock.calls[0][1].p_offers[1]).not.toHaveProperty('identity_review');
    expect(mocks.priceUpsert).not.toHaveBeenCalled();
    expect(mocks.historyInsert).not.toHaveBeenCalled();
  });

  it.each([
    { code: '42501', message: 'permission denied' },
    { code: 'PGRST202', message: 'Could not find the function public.persist_catalog_offers in the schema cache' },
    { code: '42883', message: 'function public.persist_catalog_offers(jsonb) does not exist' },
  ])('propagates RPC error $code without falling back to separate writes', async (error) => {
    mocks.rpc.mockResolvedValueOnce({ error });
    await expect(persistProductsSnapshot([product()])).rejects.toThrow(
      `Error persist catalog offers transaction: ${error.message}`,
    );
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.priceUpsert).not.toHaveBeenCalled();
    expect(mocks.historyInsert).not.toHaveBeenCalled();
  });

  it('resends the entire batch when the caller retries after an RPC failure', async () => {
    const snapshot = [product(), { ...product(false), id: 'cpu-5600-second' }];
    mocks.rpc.mockResolvedValueOnce({ error: { message: 'transaction failed' } });
    await expect(persistProductsSnapshot(snapshot)).rejects.toThrow('transaction failed');
    await expect(persistProductsSnapshot(snapshot)).resolves.toBeUndefined();
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc.mock.calls[0][1].p_offers).toHaveLength(2);
    expect(mocks.rpc.mock.calls[1]).toEqual(mocks.rpc.mock.calls[0]);
    expect(mocks.priceUpsert).not.toHaveBeenCalled();
    expect(mocks.historyInsert).not.toHaveBeenCalled();
  });

  it.each([250, 251, 501])('limits RPC batches to 250 offers for %i offers without omissions or duplicates', async (count) => {
    const snapshot = Array.from({ length: count }, (_, index) => ({
      ...product(index % 2 === 0), id: `cpu-5600-${index}`,
    }));
    await persistProductsSnapshot(snapshot);
    expect(mocks.rpc).toHaveBeenCalledTimes(Math.ceil(count / 250));
    for (const [name, { p_offers: offers }] of mocks.rpc.mock.calls) {
      expect(name).toBe('persist_catalog_offers');
      expect(offers.length).toBeGreaterThan(0);
      expect(offers.length).toBeLessThanOrEqual(250);
    }
    expect(mocks.rpc.mock.calls.map(([, args]) => args.p_offers.length)).toEqual(
      count === 250 ? [250] : count === 251 ? [250, 1] : [250, 250, 1],
    );
    expect(mocks.rpc.mock.calls.flatMap(([, args]) => args.p_offers.map((offer: { product_id: string }) => offer.product_id)))
      .toEqual(snapshot.map(({ id }) => id));
    expect(mocks.priceUpsert).not.toHaveBeenCalled();
    expect(mocks.historyInsert).not.toHaveBeenCalled();
  });

  it('falla en refresh requerido si faltan credenciales de servicio y mantiene no-op legado', async () => {
    mocks.getServerClient.mockReturnValue(null);

    await expect(persistProductsSnapshot([product()], { requirePersistence: true }))
      .rejects.toThrow('Catalog refresh requires Supabase service credentials');
    await expect(persistProductsSnapshot([product()], { requirePersistence: false })).resolves.toBeUndefined();
    expect(mocks.priceUpsert).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.productUpsert).not.toHaveBeenCalled();
    expect(mocks.historyInsert).not.toHaveBeenCalled();
  });

  it.each([undefined, '', '/pixel-box.svg'])('conserva la foto persistida cuando la nueva observación trae %s', async (image) => {
    const existingImage = 'https://www.mexx.com.ar/images/ryzen-5600.jpg';
    mocks.getServerClient.mockReturnValue(createServiceClient([{ id: 'cpu-5600', image: existingImage, content_signature: 'old', last_seen_at: null, last_scraped_at: null }]));
    await persistProductsSnapshot([{ ...product(), image }]);
    expect(mocks.productUpsert.mock.calls[0][0][0].image).toBe(existingImage);
    expect(mocks.rpc.mock.calls[0][1].p_offers[0].last_updated).toBe('2026-09-21T12:00:00.000Z');
  });

  it('acepta una foto nueva real del mismo producto aunque ya exista otra', async () => {
    mocks.getServerClient.mockReturnValue(createServiceClient([{ id: 'cpu-5600', image: 'https://www.mexx.com.ar/images/old.jpg', content_signature: 'old', last_seen_at: null, last_scraped_at: null }]));
    const newImage = 'https://www.mexx.com.ar/images/new.jpg';
    await persistProductsSnapshot([{ ...product(), image: newImage }]);
    expect(mocks.productUpsert.mock.calls[0][0][0].image).toBe(newImage);
  });

  it('conserva la foto de la primera observación del lote si otra del mismo id no la trae', async () => {
    const image = 'https://www.mexx.com.ar/images/ryzen-5600.jpg';
    await persistProductsSnapshot([{ ...product(), image }, product()]);
    expect(mocks.productUpsert.mock.calls[0][0][0].image).toBe(image);
  });
});
