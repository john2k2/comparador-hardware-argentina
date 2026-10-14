import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const runtime = vi.hoisted(() => ({ read: vi.fn(), rate: vi.fn() }));
vi.mock('@/lib/pc-builder/catalog', () => ({ readBuilderCatalogSelection: runtime.read }));
vi.mock('@/lib/server/rate-limit', () => ({ checkRateLimit: runtime.rate, getRequestIp: () => 'local-test' }));
import { GET } from './route';
beforeEach(() => { runtime.read.mockReset(); runtime.rate.mockResolvedValue({ allowed: true }); });
it('conserva products y transporta cobertura acotada sin total de catálogo', async () => {
  const coverage = { source: 'supabase', receivedOffers: 160, receivedProducts: 64, eligibleProducts: 23,
    offerLimit: 160, productLimit: 64, truncated: null, observedAt: '2026-10-14T02:00:00Z' };
  runtime.read.mockResolvedValue({ products: [{ id: 'cpu' }], coverage });
  const response = await GET(new NextRequest('https://example.test/api/pc-builder/catalog?slot=cpu'));
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ products: [{ id: 'cpu' }], coverage });
});
it('selección inválida o error no se presentan como cobertura cero', async () => {
  const invalid = await GET(new NextRequest('https://example.test/api/pc-builder/catalog?slot=invalid'));
  expect(invalid.status).toBe(400); expect(runtime.read).not.toHaveBeenCalled();
  runtime.read.mockRejectedValue(new Error('unavailable'));
  const failed = await GET(new NextRequest('https://example.test/api/pc-builder/catalog?slot=cpu'));
  expect(failed.status).toBe(503); expect(await failed.json()).not.toHaveProperty('coverage');
});
