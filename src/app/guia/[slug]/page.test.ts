import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '@/lib/types';
import type { RefreshTarget } from '@/lib/catalog/on-demand/contracts';
import { createGuideRefreshSession, nextGuideRefreshTargets } from '@/lib/catalog/on-demand/guide-refresh-session';
import { normalizeIdentityText } from '@/lib/product-identity';
import { proveOfferAttributes } from '@/lib/quality/offer-attribute-proof';

const mocks = vi.hoisted(() => ({
  snapshot: vi.fn(),
  refreshPanel: vi.fn<(props: { groups: RefreshTarget[][] }) => null>(() => null),
  rpc: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/seo/guide-catalog', () => ({ loadGuideCatalogSnapshot: mocks.snapshot }));
vi.mock('@/components/seo/GuideRefreshPanel', () => ({ GuideRefreshPanel: mocks.refreshPanel }));
vi.mock('@/lib/server/supabase-server', () => ({ getServerSupabaseServiceClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('@/lib/catalog/on-demand/dispatch', () => ({ dispatchRequestedRefresh: async () => 'deferred' }));

import BudgetGuidePage from './page';
import { POST } from '@/lib/catalog/on-demand/route-handler';

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe('botón de comprobación de la guía', () => {
  it('usa la URL observada en el POST aunque el enlace de compra tenga el slug descriptivo', async () => {
    vi.stubEnv('ENABLE_ON_DEMAND_REFRESH', '1');
    vi.stubEnv('CATALOG_REFRESH_CRON_SECRET', 'fixture-only');
    const name = 'Procesador AMD Ryzen 5 7600 5.1GHz Turbo AM5 + Wraith Stealth Cooler';
    const url = 'https://compragamer.com/producto/14309';
    const purchaseUrl = 'https://compragamer.com/producto/Procesador_AMD_Ryzen_5_7600_5_1GHz_Turbo_AM5_Wraith_Stealth_Cooler_14309';
    const sourceIdentity = { title: name, listingRef: 'compragamer:id:14309', storeSku: '100-100001015BOX' };
    const observedAt = new Date();
    const product: Product = {
      id: 'fixture-14309', name, category: 'procesadores', brand: 'AMD', model: name, specs: {},
      lowestPrice: 362_500, highestPrice: 362_500, averagePrice: 362_500, createdAt: observedAt, updatedAt: observedAt,
      prices: [{ storeId: 'compragamer', storeName: 'CompraGamer', price: 362_500, url, stock: 'in-stock',
        installment: null, lastUpdated: observedAt, sourceIdentity,
        identityReview: { version: 1, status: 'consistent', reason: 'exact-attributes', reviewedAt: observedAt.toISOString(),
          model: null, confidence: null, sourceIdentity, subject: { name: normalizeIdentityText(name), category: 'procesadores', url },
          proof: proveOfferAttributes(name, 'procesadores', name)! } }],
    };
    const before = structuredClone(product);
    mocks.snapshot.mockResolvedValue({ products: [product], unavailableSlots: [] });
    const markup = renderToStaticMarkup(await BudgetGuidePage({ params: Promise.resolve({ slug: 'pc-gamer-3-millones' }) }));
    expect(markup).toContain(`href="${purchaseUrl}"`);
    const groups = mocks.refreshPanel.mock.calls[0][0].groups;
    const targets = nextGuideRefreshTargets(createGuideRefreshSession(groups));
    // Reproduce el contrato literal de request_offer_refresh, sin crear jobs ni despachar trabajo.
    mocks.rpc.mockImplementation(async (_name: string, args: { p_targets: RefreshTarget[] }) => {
      const exists = args.p_targets.every(target => target.productId === product.id
        && product.prices.some(offer => offer.storeId === target.storeId && offer.url === target.url));
      return exists ? { error: null, data: { id: '123e4567-e89b-12d3-a456-426614174000', status: 'queued',
        targets: args.p_targets, results: [], created_at: observedAt.toISOString(), started_at: null, finished_at: null,
        expires_at: new Date(observedAt.getTime() + 60_000).toISOString() } } : { data: null, error: { message: 'REFRESH_OFFER_NOT_FOUND' } };
    });
    const response = await POST(new NextRequest('http://localhost/api/catalog/refresh', { method: 'POST',
      headers: { origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify({ targets }) }));
    expect(response.status).toBe(202);
    expect(targets).toEqual([{ productId: product.id, storeId: 'compragamer', url }]);
    expect(groups[0]).toHaveLength(1);
    expect(product).toEqual(before);
  });
});
