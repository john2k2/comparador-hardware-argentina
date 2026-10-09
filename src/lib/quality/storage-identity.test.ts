import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Product, ProductPrice } from '@/lib/types';
import { hasExplicitStorageConflict } from './storage-identity';
import { needsIdentityReview } from './offer-identity';
import { computeCurrentStorePriceStats } from '@/lib/price-utils';
import { buildProductJsonLd, getRecentProductOffers } from '@/lib/product/product-page-metadata';
import { eligibleOffers } from '@/lib/pc-builder/model';
import { resolveGuideComponent } from '@/lib/seo/budget-guide-pricing';

const name = 'Disco Solido Ssd 1Tb Western Digital Wd Green';
// Corte público 09/10 16:41 UTC: outputs/auditoria-web-2026-10-09/catalogo/ssd-detail-product-schema.json.
const mixedOffers: ProductPrice[] = [
  { storeId: 'maxtecno', storeName: 'MaxTecno', price: 254647.83, stock: 'in-stock', installment: null,
    url: 'https://maxtecno.com.ar/producto/disco-externo-hdd-western-digital-elements-1tb-usb-3-0-tipo-a-negro/', lastUpdated: new Date('2026-10-08T22:34:00Z') },
  { storeId: 'shopgamer', storeName: 'ShopGamer', price: 272499.44, stock: 'in-stock', installment: null,
    url: 'https://www.shopgamer.com.ar/productos/shp-1t-ki-microsd-canvas-sp-g3-sdcs3-1tb/', lastUpdated: new Date('2026-10-08T22:25:00Z') },
  { storeId: 'liontech', storeName: 'LionTech', price: 413408, stock: 'in-stock', installment: null,
    url: 'https://liontech.com.ar/producto/disco-interno-ssd-adata-xpg-mars-970-plus-1tb-pcie/', lastUpdated: new Date('2026-10-09T07:25:00Z') },
];
function product(prices = mixedOffers): Product {
  return { id: 'agrupado-almacenamiento-kingston-dual-1tb-ylyls4', name, model: name, brand: 'Generica',
    category: 'almacenamiento', specs: {}, prices, lowestPrice: 254647.83, highestPrice: 413408, averagePrice: 313518,
    createdAt: new Date('2026-08-01Z'), updatedAt: new Date('2026-10-09T16:00:00Z') };
}
afterEach(() => vi.useRealTimers());

describe('contradicciones explícitas de almacenamiento', () => {
  it.each([
    ['SSD WD Green 1TB', 'HDD WD Green 1TB'],
    ['SSD WD Green 1TB', 'Tarjeta microSD Kingston 1TB'],
    ['SSD Kingston NV3 1TB', 'Pendrive Kingston 1TB USB'],
    ['SSD Kingston 1TB', 'Kingston Canvas microSDXC 1TB'],
    ['SSD Sandisk 1TB', 'Sandisk SDXC 1TB'],
    ['Kingston microSDXC 512GB', 'Kingston SDXC 512GB'],
    ['SSD ADATA SU650SS 512GB', 'SSD ADATA SU800 512GB'],
    ['SSD Kingston 1TB SATA', 'SSD Kingston 1TB NVMe PCIe'],
    ['SSD Kingston 1TB M.2', 'SSD Kingston 1TB 2.5'],
    ['SSD Kingston 1TB interno', 'SSD Kingston 1TB externo USB'],
    ['SSD WD Green 1TB', 'SSD Sandisk Plus 1TB'],
    ['SSD Kingston NV3 1TB', 'SSD Kingston NV2 1TB'],
    ['SSD Samsung 870 EVO 1TB', 'SSD Samsung 870 QVO 1TB'],
    ['SSD WD Green 1TB', 'SSD WD Blue 1TB'],
    ['SSD Kingston NV3 1TB', 'SSD Kingston NV3 2TB'],
  ])('rechaza en ambos sentidos %s / %s', (left, right) => {
    expect(hasExplicitStorageConflict(left, right)).toBe(true);
    expect(hasExplicitStorageConflict(right, left)).toBe(true);
  });
  it.each([
    ['SSD Western Digital Green 1TB', 'SSD WD Green 1000GB'],
    ['SSD ADATA SU650SS 512GB', 'SSD ADATA SU650 512GB'],
    ['SSD ADATA SU650 1TB SATA III 2.5', 'SSD ADATA SU650 1TB SATA3 2,5'],
    ['SSD Kingston NV3 1TB M.2 PCIe', 'SSD Kingston NV3 1TB NVMe M2'],
    ['SSD Kingston NV3 1TB', 'SSD Kingston NV3 1TB Black'],
    ['SSD ADATA MARS 970 PLUS 1TB', 'SSD XPG MARS 970 PLUS 1TB'],
    ['SSD Kingston NV3 1TB NVMe', 'SSD Kingston 1TB'],
    ['SSD Kingston 1TB SATA 6Gb/s', 'SSD Kingston 1000GB SATA'],
  ])('no inventa conflicto por alias, unidad equivalente u omisión: %s', (left, right) => {
    expect(hasExplicitStorageConflict(left, right)).toBe(false);
    expect(hasExplicitStorageConflict(right, left)).toBe(false);
  });
  it('la contradicción de título prevalece sobre URL opaca y dictamen antiguo consistente', () => {
    const url = 'https://store.example/producto/123';
    const sourceIdentity = { title: 'Disco Interno SSD Sandisk Plus 1TB SATA III', listingRef: 'store:id:123' };
    const identityReview = { version: 1 as const, status: 'consistent' as const, reason: 'consistent-text' as const,
      reviewedAt: '2026-10-09T12:00:00Z', model: 'jev-1.13.0', confidence: 0.95,
      subject: { name: name.toLowerCase(), category: 'almacenamiento', url }, sourceIdentity };
    expect(needsIdentityReview({ url, sourceIdentity }, product())).toBe(true);
    expect(needsIdentityReview({ url, sourceIdentity, identityReview }, product())).toBe(true);
  });
});

describe('guard compartido sobre la ficha SSD publicada', () => {
  it('protege ficha, mínimo y JSON-LD en el corte real sin retirar observaciones', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-09T16:41:05Z'));
    const item = product(); const snapshot = JSON.stringify(item);
    expect(getRecentProductOffers(item)).toEqual([]);
    expect(computeCurrentStorePriceStats(item.prices, item).lowest).toBe(0);
    const schema = buildProductJsonLd(item, item.id).find(entry => entry['@type'] === 'Product');
    expect(schema).toBeUndefined();
    expect(eligibleOffers(item)).toEqual([]);
    expect(JSON.stringify(item)).toBe(snapshot);
  });
  it('una observación nueva tampoco convierte HDD, microSD o ADATA en WD Green comprable', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-09T16:41:05Z'));
    const item = product(mixedOffers.map(offer => ({ ...offer, lastUpdated: new Date() })));
    expect(eligibleOffers(item)).toEqual([]);
    const resolved = resolveGuideComponent({ name, searchTerms: ['wd green'], category: 'almacenamiento', description: '', estimatedPrice: 0 }, [item]);
    expect(resolved.offers).toEqual([]);
  });
  it('conserva la oferta exacta siguiente y separa frescura de identidad sin renovar la fecha', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-09T16:41:05Z'));
    const exact = { ...mixedOffers[0], price: 400000, url: 'https://maxtecno.com.ar/producto/disco-ssd-sata-1tb-wd-green/', lastUpdated: new Date('2026-10-09T15:00:00Z') };
    const item = product([...mixedOffers, exact]);
    expect(getRecentProductOffers(item)).toEqual([exact]);
    expect(computeCurrentStorePriceStats(item.prices, item).lowest).toBe(400000);
    expect(eligibleOffers(item)).toEqual([exact]);
    expect(exact.lastUpdated.toISOString()).toBe('2026-10-09T15:00:00.000Z');
    vi.setSystemTime(new Date('2026-10-10T16:41:05Z'));
    expect(getRecentProductOffers(item)).toEqual([]);
    expect(exact.stock).toBe('in-stock');
    expect(exact.lastUpdated.toISOString()).toBe('2026-10-09T15:00:00.000Z');
  });
});
