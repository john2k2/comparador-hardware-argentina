import { afterEach, expect, it, vi } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import type { Product } from '@/lib/types';
import type { RefreshJob } from './contracts';

// Prueba opt-in: consulta una tienda real; toda persistencia se sustituye por un receptor local.
const state = vi.hoisted(() => ({ product: null as Product | null, job: null as (RefreshJob & { lease_token: string }) | null, observations: [] as Record<string, unknown>[], results: {} as Record<string, unknown> }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/supabase-server', () => ({
  getServerSupabaseServiceClient: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === 'claim_offer_refresh') return { data: state.job, error: null };
      if (name === 'persist_requested_offer') { state.observations.push(args); return { data: true, error: null }; }
      throw new Error('Unexpected RPC');
    },
    from: () => ({ update: (value: Record<string, unknown>) => {
      state.results = value;
      const chain = { eq: () => chain, gt: () => chain, select: async () => ({ data: [{ id: state.job!.id }], error: null }) };
      return chain;
    } }),
  }),
}));
vi.mock('@/lib/pc-builder/catalog', () => ({ readBuilderCatalog: async () => [state.product] }));
import { runRequestedRefresh } from './worker';

afterEach(() => vi.unstubAllEnvs());
it.skipIf(process.env.RUN_REQUESTED_LIVE_PROBE !== '1')('refreshes an exact real offer without writing to the remote database', async () => {
  vi.stubEnv('ENABLE_JEV_OFFER_REVIEW', '0');
  const response = await fetch('http://127.0.0.1:3108/api/pc-builder/catalog?slot=cpu');
  const catalog = await response.json() as { products: Product[] };
  state.product = catalog.products.find((product) => product.prices.some((offer) => offer.storeId === 'mexx' && offer.stock === 'in-stock'))!;
  expect(state.product).toBeTruthy();
  const offer = state.product.prices.find((price) => price.storeId === 'mexx')!;
  const started = new Date().toISOString();
  state.job = { id: '123e4567-e89b-12d3-a456-426614174000', lease_token: '123e4567-e89b-12d3-a456-426614174001', status: 'running',
    targets: [{ productId: state.product.id, storeId: offer.storeId, url: offer.url }], results: [], created_at: started, started_at: started,
    finished_at: null, expires_at: new Date(Date.now() + 600000).toISOString() };
  const result = await runRequestedRefresh();
  const evidence = { source: offer.url, catalogName: state.product.name, startedAt: started, remoteDatabaseWrites: 0, result,
    observations: state.observations.map((item) => ({ price: item.p_price, stock: item.p_stock, observedAt: item.p_observed_at, review: item.p_review })), results: state.results.results };
  mkdirSync('docs/reports/pc-builder-2026-09-21', { recursive: true });
  writeFileSync('docs/reports/pc-builder-2026-09-21/source-probe.json', JSON.stringify(evidence, null, 2) + '\n');
  expect(result.status).toBe('completed');
  expect(state.observations).toHaveLength(1);
  expect(Date.parse(String(state.observations[0].p_observed_at))).toBeGreaterThanOrEqual(Date.parse(started));
}, 45000);
