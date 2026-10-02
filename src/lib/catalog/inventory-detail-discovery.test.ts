import { expect, it, vi } from 'vitest';
import type { Product } from '@/lib/types';
vi.mock('server-only', () => ({}));
import { acceptInventoryDetail } from './inventory-detail-discovery';
const target = { store_id: 'katech', source_id: '123', url: 'https://katech.com.ar/producto/ram-16gb/', title: 'Memoria RAM Kingston DDR4 16GB' };
const at = Date.now();
const detail = () => ({ id: 'old-slug', name: target.title, category: 'memoria-ram', specs: { SKU: 'store-only' },
  prices: [{ storeId: 'katech', url: target.url, price: 574710, stock: 'in-stock', lastUpdated: new Date(at) }],
}) as unknown as Product;
it('una ficha visible se guarda por ID estable, con precio y hora de esa ficha', () => {
  const accepted = acceptInventoryDetail(target, detail(), at - 1);
  expect(accepted?.id).toBe('katech-api-123');
  expect(accepted?.prices[0]).toMatchObject({ price: 574710, lastUpdated: new Date(at), priceCondition: 'unspecified', sourceIdentity: { title: target.title, storeSku: 'store-only' } });
});
it('no acepta otro destino ni una lectura anterior al inicio', () => {
  const wrong = detail(); wrong.prices[0].url = 'https://katech.com.ar/producto/ram-32gb/';
  expect(acceptInventoryDetail(target, wrong, at - 1)).toBeNull();
  expect(acceptInventoryDetail(target, detail(), at + 1)).toBeNull();
});
it('una capacidad contradictoria no crea un producto a partir del inventario antiguo', () => {
  const wrong = detail(); wrong.name = 'Memoria RAM Kingston DDR4 32GB';
  expect(acceptInventoryDetail(target, wrong, at - 1)).toBeNull();
});
