import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildOfferIdentity, resolveBaselineFromHistory } from './price-drop-baseline';
import { getHomeSectionsData, pickFeaturedProducts, resolveOfferHistory, selectCurrentPricePoints } from './home-sections';
import { getSharedCache } from '@/lib/server/shared-cache';
import { readProductsFromDatabase } from '@/lib/persistence/product-read';
import type { Product } from '@/lib/types';

vi.mock('server-only', () => ({}), { virtual: true });
vi.mock('@/lib/server/shared-cache', () => ({ getSharedCache: vi.fn(), setSharedCache: vi.fn() }));
vi.mock('@/lib/persistence/product-read', () => ({ readProductsFromDatabase: vi.fn() }));

afterEach(() => vi.useRealTimers());

describe('evidencia actual de portada', () => {
  const makeProduct = (observedAt: Date, stock = 'in-stock') => ({
    id: 'fixture-current', name: 'AMD Ryzen 5 5600', category: 'procesadores',
    updatedAt: new Date(), lowestPrice: 200000,
    prices: [{ storeId: 'mexx', url: 'https://www.mexx.com.ar/producto/ryzen-5600', price: 200000, stock, lastUpdated: observedAt }],
  } as Product);
  it('modificar la ficha no convierte una oferta vieja o de stock desconocido en destacada', () => {
    const stale = makeProduct(new Date(Date.now() - 25 * 3600000));
    const unknown = makeProduct(new Date(), 'unknown');
    const fresh = makeProduct(new Date());
    expect(pickFeaturedProducts([stale, unknown], 8)).toEqual([]);
    expect(pickFeaturedProducts([fresh], 8)).toEqual([fresh]);
  });
  it('una bajada no usa el timestamp de la ficha para reemplazar evidencia ausente', () => {
    const invalid = makeProduct(new Date(NaN));
    const unknown = makeProduct(new Date(), 'unknown');
    expect(selectCurrentPricePoints([invalid, unknown], Date.now() - 24 * 3600000)).toEqual([]);
  });
  it('rehidrata la fecha almacenada y retira una última oferta que vence dentro del caché', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-03T01:00:00Z'));
    const source = makeProduct(new Date(Date.now() - 2.99 * 3600000));
    const cached = JSON.parse(JSON.stringify({
      latestOfferProducts: [source], featuredProducts: [], priceDropProducts: [],
      featuredFallbackUsed: false, priceDropFallbackUsed: false,
    }));
    vi.mocked(getSharedCache).mockResolvedValue(cached);

    const first = await getHomeSectionsData();
    expect(first.latestOfferProducts).toHaveLength(1);
    expect(first.latestOfferProducts[0].prices[0].lastUpdated).toBeInstanceOf(Date);
    vi.setSystemTime(new Date(Date.now() + 2 * 60000));
    expect((await getHomeSectionsData()).latestOfferProducts).toEqual([]);
    expect(readProductsFromDatabase).not.toHaveBeenCalled();
    expect(cached.latestOfferProducts).toHaveLength(1);
  });
});

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

describe('buildOfferIdentity', () => {
  it('keeps variants from the same store separate by normalized URL', () => {
    expect(buildOfferIdentity('product-1', 'mexx', 'https://mexx.com/item/5600x?utm_source=test'))
      .toBe('product-1|mexx|https://mexx.com/item/5600x');
    expect(buildOfferIdentity('product-1', 'mexx', 'https://mexx.com/item/5600xt'))
      .not.toBe(buildOfferIdentity('product-1', 'mexx', 'https://mexx.com/item/5600x'));
  });

  it('falls back compatibly when legacy history has no URL', () => {
    expect(buildOfferIdentity('product-1', 'mexx', null)).toBe('product-1|mexx');
  });
});

describe('resolveOfferHistory', () => {
  it('usa historial legacy sin URL para una oferta actual con URL', () => {
    const legacy = [{ price: 130_000, recordedAtMs: 1 }];
    const history = new Map([[buildOfferIdentity('product-1', 'mexx', null), legacy]]);

    expect(resolveOfferHistory(history, 'product-1', 'mexx', 'https://mexx.com/item/5600x')).toBe(legacy);
    const exact = [{ price: 120_000, recordedAtMs: 2 }];
    history.set(buildOfferIdentity('product-1', 'mexx', 'https://mexx.com/item/5600x'), exact);
    expect(resolveOfferHistory(history, 'product-1', 'mexx', 'https://mexx.com/item/5600x')).toBe(exact);
  });
});
