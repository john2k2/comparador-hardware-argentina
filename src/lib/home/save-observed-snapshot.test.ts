import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ readClient: vi.fn(), serviceClient: vi.fn(), sections: vi.fn(), from: vi.fn(), upsert: vi.fn(), finish: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/supabase-server', () => ({ getServerSupabaseReadClient: mocks.readClient, getServerSupabaseServiceClient: mocks.serviceClient }));
vi.mock('./home-sections', () => ({ getHomeSectionsData: mocks.sections }));
import { saveObservedHomeSnapshot } from './save-observed-snapshot';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.readClient.mockReturnValue({});
  mocks.serviceClient.mockReturnValue({ from: mocks.from });
  mocks.from.mockReturnValue({ upsert: mocks.upsert });
  mocks.upsert.mockReturnValue({ abortSignal: mocks.finish });
  mocks.finish.mockResolvedValue({ error: null });
  mocks.sections.mockResolvedValue({ latestOfferProducts: [], priceDropProducts: [], priceDropFallbackUsed: false });
});

describe('guardado de la selección pública', () => {
  it('no sobrescribe un corte previo con un falso vacío cuando falta el lector aunque pueda escribir', async () => {
    mocks.readClient.mockReturnValue(null);
    await expect(saveObservedHomeSnapshot()).rejects.toThrow('lectura del catálogo');
    expect(mocks.sections).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('un fallo de lectura o guardado no se anuncia como persistido', async () => {
    mocks.sections.mockRejectedValueOnce(new Error('timeout'));
    await expect(saveObservedHomeSnapshot()).rejects.toThrow('timeout');
    expect(mocks.upsert).not.toHaveBeenCalled();
    mocks.finish.mockResolvedValueOnce({ error: { message: 'write failed' } });
    await expect(saveObservedHomeSnapshot()).rejects.toThrow('guardar el corte');
  });
  it('permite guardar una selección realmente vacía con fecha de lectura y clave pública fijas', async () => {
    const collectedAt = await saveObservedHomeSnapshot();
    expect(mocks.from).toHaveBeenCalledWith('measurement_dashboard_entries');
    expect(mocks.upsert).toHaveBeenCalledWith({ entry_key: 'measurement-dashboard-v1:public-home', scope: 'measurement-dashboard-v1',
      payload: { kind: 'public-home', data: { collectedAt, latestOfferProducts: [], priceDropProducts: [], priceDropFallbackUsed: false } }, updated_at: collectedAt }, { onConflict: 'entry_key' });
  });
  it('conserva sólo ofertas elegibles y sus fechas reales, sin guardar relleno como bajas de precio', async () => {
    const now = Date.now();
    const observed = new Date(now - 60_000);
    const offer = { storeId: 'mexx', storeName: 'Mexx', url: 'https://www.mexx.com.ar/ryzen-5600', price: 200_000,
      stock: 'in-stock', lastUpdated: observed };
    const product = { id: 'cpu', name: 'AMD Ryzen 5 5600', category: 'procesadores', brand: 'AMD', model: '5600', specs: {},
      createdAt: new Date(now), updatedAt: new Date(now), lowestPrice: 1, highestPrice: 1, averagePrice: 1,
      prices: [offer, { ...offer, price: 1, lastUpdated: new Date(now - 4 * 3_600_000) }], privateField: 'not-public' };
    mocks.sections.mockResolvedValueOnce({ latestOfferProducts: [product], priceDropProducts: [product], priceDropFallbackUsed: true });
    await saveObservedHomeSnapshot();
    const { payload } = mocks.upsert.mock.calls[0][0];
    expect(payload.data.latestOfferProducts[0].prices).toHaveLength(1);
    expect(payload.data.latestOfferProducts[0].prices[0].lastUpdated).toEqual(observed);
    expect(payload.data.latestOfferProducts[0].lowestPrice).toBe(200_000);
    expect(payload.data.priceDropProducts).toEqual([]);
    expect(JSON.stringify(payload)).not.toContain('not-public');
  });
});
