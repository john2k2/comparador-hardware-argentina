import { afterEach, expect, it, vi } from 'vitest';
import type { Product } from '@/lib/types';
const dependencies = vi.hoisted(() => ({ recent: vi.fn(), sections: vi.fn(), edge: vi.fn() }));
vi.mock('@/lib/catalog/catalog-backend', () => ({ isCatalogSqlBackendEnabled: () => false }));
vi.mock('@/lib/home/home-sections', () => ({ getHomeSectionsData: dependencies.sections }));
vi.mock('@/lib/home/edge-read', () => ({ handleObservedHomeRead: dependencies.edge }));
vi.mock('@/lib/persistence/recent-offer-products', () => ({ readRecentOfferProducts: dependencies.recent }));
import { GET } from './route';
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); vi.clearAllMocks(); });
it('el origen Node conserva la fecha de oferta y no lee cortes privados ni anuncia bajas', async () => {
  vi.stubEnv('CATALOG_NODE_ORIGIN', '1'); vi.useFakeTimers();
  const now = Date.parse('2026-10-20T19:00:00Z'); vi.setSystemTime(now);
  const stamp = new Date(now - 30 * 60_000);
  const product: Product = { id: 'ryzen-5600', name: 'AMD Ryzen 5 5600', category: 'procesadores',
    brand: 'AMD', model: 'Ryzen 5 5600', specs: {}, lowestPrice: 200000, highestPrice: 200000, averagePrice: 200000,
    createdAt: stamp, updatedAt: stamp, prices: [{ storeId: 'mexx', storeName: 'Mexx',
      url: 'https://www.mexx.com.ar/producto/ryzen-5600', price: 200000, stock: 'in-stock',
      installment: null, lastUpdated: stamp }] };
  dependencies.recent.mockResolvedValue([product]);
  const response = await GET(new Request('https://www.comparador-hardware.com.ar/api/home/observed-sections'));
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.latestOfferProducts[0].prices[0].lastUpdated).toBe(stamp.toISOString());
  expect(body.priceDropProducts).toEqual([]); expect(body.priceDropFallbackUsed).toBe(true);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(dependencies.sections).not.toHaveBeenCalled(); expect(dependencies.edge).not.toHaveBeenCalled();
});
it('un fallo de la base se comunica como no disponible, sin mensajes internos', async () => {
  vi.stubEnv('CATALOG_NODE_ORIGIN', '1');
  dependencies.recent.mockRejectedValue(Error('PRIVATE_DATABASE_DETAILS'));
  const response = await GET(new Request('https://www.comparador-hardware.com.ar/api/home/observed-sections'));
  expect(response.status).toBe(503); expect(await response.text()).not.toContain('PRIVATE_DATABASE_DETAILS');
});
