import { describe, expect, it } from 'vitest';
import type { Product, ProductPrice } from '@/lib/types';
import {
  STORE_LANDINGS,
  buildStoreCatalogSnapshot,
  buildStoreLandingPath,
  buildStoreMetadata,
  getStoreLanding,
} from './store-landings';

const NOW = Date.parse('2026-09-21T12:00:00.000Z');

function offer(overrides: Partial<ProductPrice> & Pick<ProductPrice, 'storeId' | 'storeName' | 'price'>): ProductPrice {
  return {
    url: `https://store.example/${overrides.storeId}/${overrides.price}`,
    stock: 'in-stock',
    installment: null,
    lastUpdated: new Date(NOW - 24 * 60 * 60 * 1000),
    ...overrides,
  };
}

function product(overrides: Partial<Product> & Pick<Product, 'id' | 'name' | 'category'>): Product {
  const prices = overrides.prices ?? [];
  const values = prices.map((item) => item.price);
  const lowest = values.length ? Math.min(...values) : 0;
  return {
    brand: 'Test',
    model: overrides.name,
    specs: {},
    prices,
    lowestPrice: lowest,
    highestPrice: lowest,
    averagePrice: lowest,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-21T10:00:00.000Z'),
    ...overrides,
  };
}

describe('store landing catalog snapshots', () => {
  it('allowlists the three public stores and routes unknown stores to search', () => {
    expect(STORE_LANDINGS.map((store) => store.id)).toEqual(['maximus', 'venex', 'mexx']);
    expect(getStoreLanding('maximus')).toMatchObject({ name: 'Maximus' });
    expect(getStoreLanding('otra-tienda')).toBeNull();
    expect(buildStoreLandingPath('mexx')).toBe('/tiendas/mexx');
    expect(buildStoreLandingPath('otra tienda')).toBe('/search?stores=otra%20tienda');
  });

  it('keeps only available, secure and identity-consistent offers from the selected store', () => {
    const selected = product({
      id: 'valid',
      name: 'AMD Ryzen 5 5600',
      category: 'procesadores',
      prices: [
        offer({ storeId: 'maximus', storeName: 'Maximus', price: 100_000, url: 'https://maximus.com.ar/amd-ryzen-5-5600' }),
        offer({ storeId: 'venex', storeName: 'Venex', price: 90_000, url: 'https://venex.com.ar/amd-ryzen-5-5600' }),
      ],
    });
    const lowStock = product({
      id: 'low-stock',
      name: 'SSD NVMe 1TB',
      category: 'almacenamiento',
      prices: [offer({ storeId: 'maximus', storeName: 'Maximus', price: 50_000, stock: 'low-stock', url: 'https://maximus.com.ar/ssd-nvme-1tb' })],
    });
    const unavailable = product({
      id: 'unavailable',
      name: 'Memoria 16GB DDR4',
      category: 'memoria-ram',
      prices: [offer({ storeId: 'maximus', storeName: 'Maximus', price: 40_000, stock: 'out-of-stock', url: 'https://maximus.com.ar/memoria-16gb-ddr4' })],
    });
    const insecure = product({
      id: 'insecure',
      name: 'Fuente 650W',
      category: 'fuentes-alimentacion',
      prices: [offer({ storeId: 'maximus', storeName: 'Maximus', price: 70_000, url: 'http://maximus.com.ar/fuente-650w' })],
    });
    const conflict = product({
      id: 'conflict',
      name: 'GeForce RTX 4060 Ti 8GB',
      category: 'tarjetas-graficas',
      prices: [offer({ storeId: 'maximus', storeName: 'Maximus', price: 300_000, url: 'https://maximus.com.ar/geforce-rtx-4060-8gb' })],
    });

    const snapshot = buildStoreCatalogSnapshot([selected, lowStock, unavailable, insecure, conflict], 'maximus', NOW);

    expect(snapshot.products.map((item) => item.id)).toEqual(['valid', 'low-stock']);
    expect(snapshot.products.flatMap((item) => item.prices).every((item) => item.storeId === 'maximus')).toBe(true);
  });

  it('deduplicates canonical products and caps a store snapshot at 24 products', () => {
    const duplicate = product({
      id: 'duplicate-first',
      canonicalProductKey: 'same-product',
      name: 'SSD NVMe 1TB',
      category: 'almacenamiento',
      prices: [offer({ storeId: 'maximus', storeName: 'Maximus', price: 40_000, url: 'https://maximus.com.ar/ssd-nvme-1tb-a' })],
    });
    const duplicateLater = product({
      id: 'duplicate-later',
      canonicalProductKey: 'same-product',
      name: 'SSD NVMe 1TB variante',
      category: 'almacenamiento',
      prices: [offer({ storeId: 'maximus', storeName: 'Maximus', price: 41_000, url: 'https://maximus.com.ar/ssd-nvme-1tb-b' })],
    });
    const products = [duplicate, duplicateLater, ...Array.from({ length: 24 }, (_, index) => product({
      id: `product-${index}`,
      name: `SSD NVMe ${index + 2}TB`,
      category: 'almacenamiento',
      prices: [offer({ storeId: 'maximus', storeName: 'Maximus', price: 50_000 + index, url: `https://maximus.com.ar/ssd-nvme-${index + 2}tb` })],
    }))];

    const snapshot = buildStoreCatalogSnapshot(products, 'maximus', NOW);

    expect(snapshot.products).toHaveLength(24);
    expect(snapshot.products.map((item) => item.id)).toContain('duplicate-first');
    expect(snapshot.products.map((item) => item.id)).not.toContain('duplicate-later');
  });

  it('counts fresh offers only through the 72-hour boundary and rejects future dates', () => {
    const exact = product({ id: 'exact', name: 'SSD exacto 1TB', category: 'almacenamiento', prices: [offer({ storeId: 'maximus', storeName: 'Maximus', price: 40_000, lastUpdated: new Date(NOW - 72 * 60 * 60 * 1000), url: 'https://maximus.com.ar/ssd-exacto-1tb' })] });
    const stale = product({ id: 'stale', name: 'SSD viejo 2TB', category: 'almacenamiento', prices: [offer({ storeId: 'maximus', storeName: 'Maximus', price: 50_000, lastUpdated: new Date(NOW - 72 * 60 * 60 * 1000 - 1), url: 'https://maximus.com.ar/ssd-viejo-2tb' })] });
    const future = product({ id: 'future', name: 'SSD futuro 4TB', category: 'almacenamiento', prices: [offer({ storeId: 'maximus', storeName: 'Maximus', price: 60_000, lastUpdated: new Date(NOW + 1), url: 'https://maximus.com.ar/ssd-futuro-4tb' })] });

    const snapshot = buildStoreCatalogSnapshot([exact, stale, future], 'maximus', NOW);

    expect(snapshot.products).toHaveLength(3);
    expect(snapshot.freshProducts).toBe(1);
    expect(snapshot.products.find((item) => item.id === 'exact')?.lastScrapedAt?.getTime()).toBe(NOW - 72 * 60 * 60 * 1000);
  });

  it('is indexable only with at least six products and three fresh offers', () => {
    const products = Array.from({ length: 6 }, (_, index) => product({
      id: `product-${index}`,
      name: `SSD NVMe ${index + 1}TB`,
      category: 'almacenamiento',
      prices: [offer({
        storeId: 'maximus',
        storeName: 'Maximus',
        price: 40_000 + index,
        lastUpdated: new Date(NOW - (index < 3 ? 24 : 96) * 60 * 60 * 1000),
        url: `https://maximus.com.ar/ssd-${index + 1}tb`,
      })],
    }));

    const indexable = buildStoreCatalogSnapshot(products, 'maximus', NOW);
    const tooFewProducts = buildStoreCatalogSnapshot(products.slice(0, 5), 'maximus', NOW);
    const tooFewFresh = buildStoreCatalogSnapshot(products.map((item, index) => index >= 2 ? {
      ...item,
      prices: [{ ...item.prices[0], lastUpdated: new Date(NOW - 96 * 60 * 60 * 1000) }],
    } : item), 'maximus', NOW);

    expect(indexable).toMatchObject({ products: expect.any(Array), freshProducts: 3, indexable: true });
    expect(tooFewProducts.indexable).toBe(false);
    expect(tooFewFresh).toMatchObject({ freshProducts: 2, indexable: false });
  });

  it('marks unknown stores and non-indexable known snapshots noindex', () => {
    expect(buildStoreMetadata('missing-store', true).robots).toMatchObject({ index: false, follow: false });
    expect(buildStoreMetadata('maximus', false).robots).toMatchObject({ index: false, follow: true });
    expect(buildStoreMetadata('maximus', true).robots).toMatchObject({ index: true, follow: true });
  });
});
