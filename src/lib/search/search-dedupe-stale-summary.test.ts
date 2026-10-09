import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { Product } from '@/lib/types';
const { readPage } = vi.hoisted(() => ({ readPage: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/server', async original => ({ ...await original<typeof import('next/server')>(), after: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('@/lib/server/rate-limit', async original => ({ ...await original<typeof import('@/lib/server/rate-limit')>(),
  checkRateLimit: vi.fn(async () => ({ allowed: true, limit: 30, remaining: 29, resetAtMs: Date.now() + 60000, retryAfterSeconds: 0 })),
  getRequestIp: () => '203.0.113.7' }));
vi.mock('@/lib/server/shared-cache', () => ({ getSharedCache: vi.fn(async () => null), setSharedCache: vi.fn() }));
vi.mock('@/lib/persistence/product-read', () => ({ readProductsPageFromDatabase: readPage }));
vi.mock('@/lib/catalog/refresh-demand', () => ({ recordCatalogRefreshDemand: vi.fn() }));
vi.mock('@/lib/search/search-live', () => ({ runLiveSearch: vi.fn() }));
vi.mock('@/lib/server/runtime-flags', () => ({ isStableRuntimeMode: () => false, shouldSkipLiveScraping: () => true }));
vi.mock('@/lib/telemetry/operational-metrics', () => ({ recordEndpointRequestEvent: vi.fn(), runObservedStoreScrape: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
import { GET } from './search-route-handler';
import { hasCurrentSearchPagePrices } from './search-handler-shared';
import { guardIdentityPage, type IdentityPageOptions } from './identity-page-guard';

function contaminatedPage() {
  const date = new Date('2026-10-09T16:00:00Z');
  const contaminated: Product = {
    id: 'agrupado-almacenamiento-kingston-dual-1tb-ylyls4', name: 'Disco Solido Ssd 1Tb Western Digital Wd Green',
    model: 'Disco Solido Ssd 1Tb Western Digital Wd Green', brand: 'Generica', category: 'almacenamiento', specs: {},
    createdAt: date, updatedAt: date, lowestPrice: 254647.83, highestPrice: 254647.83, averagePrice: 254648,
    prices: [{ storeId: 'maxtecno', storeName: 'MaxTecno', price: 254647.83, stock: 'in-stock', installment: null,
      url: 'https://maxtecno.com.ar/producto/disco-externo-hdd-western-digital-elements-1tb-usb-3-0-tipo-a-negro/',
      lastUpdated: new Date('2026-10-08T22:34:00Z') }],
  };
  const valid: Product = { ...contaminated, id: 'ssd-valid', name: 'SSD Kingston NV3 1TB', model: 'SSD Kingston NV3 1TB',
    lowestPrice: 400000, highestPrice: 400000, averagePrice: 400000,
    prices: [{ ...contaminated.prices[0], price: 400000, url: 'https://maxtecno.com.ar/producto/ssd-kingston-nv3-1tb/', lastUpdated: date }] };
  return { products: [contaminated, valid], total: 2, totalPages: 1, page: 1, pageSize: 12 };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-09T16:41:05Z')); vi.clearAllMocks(); });
afterEach(() => vi.useRealTimers());

describe('resumen SQL previo al nuevo guard de almacenamiento', () => {
  it('sirve la categoría 200 tras el guard del loader, aun con resumen SQL mínimo HDD previo', async () => {
    const page = contaminatedPage(); const snapshot = JSON.stringify(page);
    expect(hasCurrentSearchPagePrices(page.products)).toBe(false);
    expect(hasCurrentSearchPagePrices([page.products[1]])).toBe(true);
    // El mock reproduce el contrato del loader real: el guard va después de
    // mapear las filas SQL y antes de validar la vigencia de toda la página.
    readPage.mockImplementation(async (params: IdentityPageOptions) => ({ ...page, ...guardIdentityPage(page.products, params) }));
    const response = await GET(new NextRequest('https://example.com/api/search?category=almacenamiento'));
    expect(response.status).toBe(200);
    expect(readPage).toHaveBeenCalledTimes(1);
    const payload = await response.json();
    expect(payload.products.map((product: Product) => product.id)).toEqual(['ssd-valid']);
    expect(payload.pagination).toMatchObject({ limit: 1, total: 2, totalPages: 1, identityExcludedOnPage: 1 });
    expect(JSON.stringify(page)).toBe(snapshot);
  });
});
