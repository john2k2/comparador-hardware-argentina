import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), verify: vi.fn(), rawCG: vi.fn(), mappedCG: vi.fn() }));
vi.mock('./compragamer-catalog', () => ({ getCompraGamerCatalog: mocks.rawCG }));
vi.mock('./compragamer', () => ({ fetchCompraGamerCatalogProducts: mocks.mappedCG }));
vi.mock('./source-http', async () => ({ ...await vi.importActual('./source-http'), sourceFetch: mocks.fetch }));
vi.mock('./woocommerce-known-batch', async () => ({ ...await vi.importActual('./woocommerce-known-batch'), verifyWooStoreProducts: mocks.verify }));
import { fetchSourceInventory, parseInventoryPage } from './source-inventory';
const item = (id: number) => ({ id, name: 'Memoria RAM Kingston DDR4 16GB', permalink: `https://maxtecno.com.ar/producto/ram-${id}/`, type: 'simple', has_options: false,
  is_in_stock: true, is_purchasable: true, is_on_backorder: false, stock_availability: { class: 'in-stock' }, prices: { currency_code: 'ARS', currency_minor_unit: 2, price: '100123' } });
const response = (items: unknown[], total = items.length, pages = Math.ceil(total / 100)) => new Response(JSON.stringify(items), { headers: { 'x-wp-total': String(total), 'x-wp-totalpages': String(pages) } });
beforeEach(() => { vi.resetAllMocks(); mocks.verify.mockResolvedValue(undefined); });
it('registra variantes ambiguas como presencia pero no como observación de precio', () => {
  const at = new Date();
  const parsed = parseInventoryPage([item(1), { ...item(2), type: 'variable', has_options: true }], 'maxtecno', at);
  expect(parsed).toHaveLength(2); expect(parsed[0].product?.prices[0].price).toBe(1001.23);
  expect(parsed[0].product?.prices[0].lastUpdated).toBe(at); expect(parsed[1].product).toBeUndefined();
});
it('recorre todas las páginas y corrobora el precio visible antes de devolver inventario', async () => {
  mocks.fetch.mockResolvedValueOnce(response(Array.from({ length: 100 }, (_, index) => item(index + 1)), 101, 2)).mockResolvedValueOnce(response([item(101)], 101, 2));
  const result = await fetchSourceInventory('maxtecno', new AbortController().signal);
  expect(result.listings).toHaveLength(101); expect(result.pages).toBe(2); expect(mocks.verify).toHaveBeenCalledTimes(1);
  expect(new URL(mocks.fetch.mock.calls[1][1]).searchParams.get('page')).toBe('2');
});
it.each(['changed-total', 'duplicate-id', 'missing-headers', 'short-page'])('rechaza el inventario incompleto: %s', async kind => {
  const first = Array.from({ length: 100 }, (_, index) => item(index + 1));
  mocks.fetch.mockResolvedValueOnce(kind === 'missing-headers' ? new Response(JSON.stringify(first)) : response(kind === 'short-page' ? first.slice(1) : first, 101, 2))
    .mockResolvedValueOnce(response([item(kind === 'duplicate-id' ? 1 : 101)], kind === 'changed-total' ? 102 : 101, 2));
  await expect(fetchSourceInventory('maxtecno', new AbortController().signal)).rejects.toThrow('invalid-response');
  expect(mocks.verify).not.toHaveBeenCalled();
});
it('rechaza dominios ajenos y títulos ausentes antes de registrar la página', () => {
  expect(() => parseInventoryPage([{ ...item(1), permalink: 'https://other.example/producto/1/' }], 'maxtecno', new Date())).toThrow('invalid-response');
  expect(() => parseInventoryPage([{ ...item(1), name: '' }], 'maxtecno', new Date())).toThrow('invalid-response');
});
it('una discrepancia de precio visible impide usar todo el catálogo', async () => {
  mocks.fetch.mockResolvedValueOnce(response([item(1)])); mocks.verify.mockRejectedValueOnce(new Error('inconsistent-source'));
  await expect(fetchSourceInventory('maxtecno', new AbortController().signal)).rejects.toThrow('inconsistent-source');
});
it('Katech aporta presencia completa sin usar los precios contradictorios de su API', async () => {
  mocks.fetch.mockResolvedValueOnce(response([{ ...item(1), permalink: 'https://katech.com.ar/producto/ram-1/' }]));
  const result = await fetchSourceInventory('katech', new AbortController().signal);
  expect(result.listings).toHaveLength(1); expect(result.listings[0].product).toBeUndefined();
  expect(result.rejectedProducts).toBe(1); expect(mocks.verify).not.toHaveBeenCalled();
});
it('CompraGamer conserva también los registros que no producen una oferta clasificable', async () => {
  mocks.rawCG.mockResolvedValue([{ id_producto: 1, nombre: 'Memoria RAM DDR4 16GB' }, { id_producto: 2, nombre: 'Servicio sin precio comprable' }]);
  mocks.mappedCG.mockResolvedValue([{ name: 'Memoria RAM DDR4 16GB', prices: [{ url: 'https://compragamer.com/producto/Memoria_RAM_DDR4_16GB_1' }] }]);
  const result = await fetchSourceInventory('compragamer', new AbortController().signal);
  expect(result.listings).toHaveLength(2); expect(result.rejectedProducts).toBe(1);
  expect(result.listings[1]).toMatchObject({ sourceId: '2', title: 'Servicio sin precio comprable', product: undefined });
});
