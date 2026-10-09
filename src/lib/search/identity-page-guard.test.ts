import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '@/lib/types';
import { guardIdentityPage } from './identity-page-guard';
import { hasCurrentSearchPagePrices } from './search-handler-shared';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/shared-cache', () => ({ getSharedCache: vi.fn(), setSharedCache: vi.fn() }));

function storagePageFixture() {
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
  return [contaminated, valid];
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-09T16:41:05Z')); });
afterEach(() => vi.useRealTimers());

describe('guard de identidad para páginas SQL antiguas', () => {
  it('excluye el SSD con mínimo HDD y conserva la fila legítima sin mutar observaciones', () => {
    const products = storagePageFixture(), snapshot = JSON.stringify(products);
    const result = guardIdentityPage(products);
    expect(result.identityExcludedOnPage).toBe(1);
    expect(result.products).toEqual([products[1]]);
    expect(hasCurrentSearchPagePrices(result.products)).toBe(true);
    expect(JSON.stringify(products)).toBe(snapshot);
  });
  it('recalcula usando la siguiente oferta válida, conserva precios originales y reordena sólo esta página', () => {
    const products = storagePageFixture();
    products[0].prices.push({ ...products[1].prices[0], price: 450000,
      url: 'https://maxtecno.com.ar/producto/ssd-western-digital-wd-green-1tb/' });
    const result = guardIdentityPage(products, { sortBy: 'price-asc' });
    expect(result.identityExcludedOnPage).toBe(0);
    expect(result.products.map(product => product.lowestPrice)).toEqual([400000, 450000]);
    expect(result.products[1].prices).toBe(products[0].prices);
    expect(result.products[1].updatedAt).toBe(products[0].updatedAt);
    expect(hasCurrentSearchPagePrices(result.products)).toBe(true);
    expect(guardIdentityPage(products, { maxPrice: 425000 }).identityExcludedOnPage).toBe(1);
    expect(guardIdentityPage(products, { minPrice: 460000 }).identityExcludedOnPage).toBe(1);
    expect(guardIdentityPage(products, { minPrice: 450000, maxPrice: 450000 }).products).toHaveLength(2);
  });
  it('no convierte frescura, stock o dictamen pendiente sin contradicción en exclusiones de identidad', () => {
    const product = storagePageFixture()[1];
    for (const offer of [
      { ...product.prices[0], lastUpdated: new Date('2026-10-01T16:00:00Z') },
      { ...product.prices[0], stock: 'out-of-stock' as const },
      { ...product.prices[0], identityReview: { version: 1 as const, status: 'needs-review' as const, reason: 'insufficient-evidence' as const,
        model: null, confidence: null, reviewedAt: null, subject: { name: product.name, category: product.category, url: product.prices[0].url } } },
    ]) {
      const rows = [{ ...product, prices: [offer] }];
      expect(guardIdentityPage(rows)).toEqual({ products: rows, identityExcludedOnPage: 0 });
      expect(hasCurrentSearchPagePrices(rows)).toBe(false);
    }
  });
});
