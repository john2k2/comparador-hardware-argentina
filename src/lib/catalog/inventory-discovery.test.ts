import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Product } from '@/lib/types';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ client: vi.fn(), fetch: vi.fn(), persist: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/server/supabase-server', () => ({ getServerSupabaseServiceClient: mocks.client }));
vi.mock('@/lib/scrapers/source-inventory', () => ({ fetchSourceInventory: mocks.fetch }));
vi.mock('@/lib/persistence/product-catalog', () => ({ persistProductsSnapshot: mocks.persist }));
import { planInventoryDiscovery, runInventoryDiscovery } from './inventory-discovery';
const product = (id: string, url = `https://maxtecno.com.ar/producto/${id}/`) => ({
  id: `maxtecno-api-${id}`, name: 'Memoria RAM Kingston DDR4 16GB', category: 'memoria-ram', specs: { SourceListingId: id, SKU: 'store-sku' },
  prices: [{ storeId: 'maxtecno', url, lastUpdated: new Date('2026-10-02T00:30:00Z') }],
}) as unknown as Product;
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv('CATALOG_REQUESTED_RUNNER', '1'); });
afterEach(() => vi.unstubAllEnvs());
it('importa sólo publicaciones nuevas por URL exacta; conserva hora y SKU de tienda', () => {
  const current = product('2');
  const planned = planInventoryDiscovery('maxtecno', [product('1'), current], [{ url: product('1').prices[0].url, product_id: 'existing-group' }], []);
  expect(planned.newProducts).toEqual([current]);
  expect(current.prices[0].sourceIdentity).toEqual({ listingRef: 'maxtecno:url:https://maxtecno.com.ar/producto/2', title: current.name, storeSku: 'store-sku' });
  expect(current.prices[0].lastUpdated).toEqual(new Date('2026-10-02T00:30:00Z'));
});
it('un ID estable con URL migrada no crea otro producto ni reasigna el anterior por título', () => {
  const planned = planInventoryDiscovery('maxtecno', [product('1')], [], [{ source_id: '1', url: 'https://maxtecno.com.ar/producto/old/', product_id: 'existing' }]);
  expect(planned).toEqual({ newProducts: [], migratedUrls: 1 });
});
it('el enlace registrado conserva identidad aunque todavía no tenga oferta guardada', () => {
  expect(planInventoryDiscovery('maxtecno', [product('1')], [], [{ source_id: '1', url: product('1').prices[0].url, product_id: 'existing' }]).newProducts).toEqual([]);
});
it('respeta el límite de un inventario diario sin solicitar fuentes ni precios', async () => {
  mocks.client.mockReturnValue({ rpc: mocks.rpc }); mocks.rpc.mockResolvedValue({ data: false, error: null });
  const results = await runInventoryDiscovery();
  expect(results.every(item => item.status === 'deferred')).toBe(true);
  expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.persist).not.toHaveBeenCalled();
});
it('no confirma inventario completo si falla el registro posterior a una observación real', async () => {
  const chain = { select: () => chain, eq: () => chain, order: () => chain, range: async () => ({ data: [], error: null }) };
  mocks.client.mockReturnValue({ rpc: mocks.rpc, from: () => chain });
  mocks.rpc.mockImplementation(async (name, args) => ({ data: name === 'claim_catalog_inventory' ? args.p_store_id === 'maxtecno' : name === 'finish_catalog_inventory', error: null }));
  mocks.fetch.mockResolvedValue({ listings: [{ sourceId: '1', url: product('1').prices[0].url, title: product('1').name, product: product('1') }], pages: 1, rejectedProducts: 0 });
  mocks.persist.mockResolvedValue(undefined);
  const results = await runInventoryDiscovery();
  expect(results.find(item => item.storeId === 'maxtecno')).toMatchObject({ status: 'failed', imported: 1, code: 'REFRESH_INVENTORY_REGISTER_FAILED' });
  expect(mocks.rpc.mock.calls.find(([name]) => name === 'finish_catalog_inventory')?.[1].p_success).toBe(false);
  expect(mocks.persist.mock.calls[0][0][0].prices[0].lastUpdated).toEqual(new Date('2026-10-02T00:30:00Z'));
});
