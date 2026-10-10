import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ client: vi.fn(), reply: { data: [] as unknown, error: null as unknown }, gte: vi.fn(), limit: vi.fn() }));
vi.mock('@/lib/server/supabase-server', () => ({ getServerSupabaseServiceClient: mocks.client }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }));
import { loadCatalogRefreshDemands } from './refresh-demand';
beforeEach(() => {
  vi.clearAllMocks(); mocks.reply = { data: [], error: null };
  const chain = { select: () => chain, eq: () => chain, gt: () => chain, order: () => chain,
    limit: mocks.limit.mockImplementation(() => chain), gte: mocks.gte.mockImplementation(() => chain),
    then: (resolve: (value: typeof mocks.reply) => unknown) => Promise.resolve(mocks.reply).then(resolve) };
  mocks.client.mockReturnValue({ from: () => chain });
});
it('la lectura acotada filtra updated_at sin alterar los consumidores anteriores', async () => {
  expect(await loadCatalogRefreshDemands(3, { since: '2026-10-09T18:00:00Z', strict: true })).toEqual([]);
  expect(mocks.gte).toHaveBeenCalledWith('updated_at', '2026-10-09T18:00:00Z');
  expect(mocks.limit).toHaveBeenCalledWith(20);
  mocks.gte.mockClear(); await loadCatalogRefreshDemands(30);
  expect(mocks.gte).not.toHaveBeenCalled(); expect(mocks.limit).toHaveBeenLastCalledWith(120);
});
it('la lectura estricta distingue DB ausente/error de una lista vacía', async () => {
  mocks.client.mockReturnValueOnce(null);
  await expect(loadCatalogRefreshDemands(3, { strict: true })).rejects.toThrow('PRIORITY_DEMAND_DATABASE_UNAVAILABLE');
  mocks.reply.error = { message: 'synthetic-error' };
  await expect(loadCatalogRefreshDemands(3, { strict: true })).rejects.toThrow('PRIORITY_DEMAND_READ_FAILED');
  expect(await loadCatalogRefreshDemands(3)).toBeNull();
  mocks.reply = { data: null, error: null };
  await expect(loadCatalogRefreshDemands(3, { strict: true })).rejects.toThrow('PRIORITY_DEMAND_INVALID_RESPONSE');
});
