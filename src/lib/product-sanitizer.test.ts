import { describe, expect, it } from 'vitest';
import { sanitizeProduct } from '@/lib/product-sanitizer';
import type { Product } from '@/lib/types';
import { proveManufacturerRamAttributes } from '@/lib/quality/offer-attribute-proof';
import { normalizeIdentityText } from '@/lib/product-identity';
import { getAvailableComparableStorePrices } from '@/lib/price-utils';

function buildProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'gpu-1',
    name: '  ASUS RTX 5070 Ti  ',
    category: 'tarjetas-graficas',
    brand: ' ASUS ',
    model: ' RTX 5070 Ti ',
    description: '  GPU gamer  ',
    image: 'https://cdn.example.com/gpu.webp',
    specs: { ' Memoria ': ' 16 GB ' },
    prices: [
      {
        storeId: 'venex',
        storeName: ' Venex ',
        url: ' https://venex.com.ar/gpu ',
        price: 1_250_000,
        installment: null,
        stock: 'in-stock',
        lastUpdated: new Date('2026-03-26T12:00:00.000Z'),
      },
      {
        storeId: 'compugarden',
        storeName: ' Compugarden ',
        url: ' https://compugarden.com.ar/gpu ',
        price: 24_849_611,
        installment: null,
        stock: 'in-stock',
        lastUpdated: new Date('2026-03-26T12:00:00.000Z'),
      },
    ],
    lowestPrice: 0,
    highestPrice: 0,
    averagePrice: 0,
    createdAt: new Date('2026-03-26T12:00:00.000Z'),
    updatedAt: new Date('2026-03-26T12:00:00.000Z'),
    ...overrides,
  };
}

describe('product-sanitizer', () => {
  it('la limpieza visual no resucita un proof RAM inválido ni pierde una aprobación con SKU actual', () => {
    const name = 'Memoria Corsair DDR4 16GB 3200MHz Vengeance RGB RS Black CL16', sku = 'CMG16GX4M1E3200C16';
    const url = 'https://compragamer.com/producto/RAM_15558', listingRef = 'compragamer:id:15558';
    const subject = { title: name, sku, specs: { SKU: sku } }, sourceIdentity = { title: name, storeSku: sku, listingRef };
    const product = buildProduct({ name, category: 'memoria-ram', specs: { SKU: sku } });
    product.prices = [{ ...product.prices[0], storeId: 'compragamer', url, lastUpdated: new Date(), sourceIdentity,
      identityReview: { version: 1, status: 'consistent', reason: 'manufacturer-ram', model: null, confidence: null,
        reviewedAt: new Date().toISOString(), subject: { name: normalizeIdentityText(name), category: 'memoria-ram', url },
        sourceIdentity, proof: proveManufacturerRamAttributes(subject, subject, { storeId: 'compragamer', url, listingRef })! } }];
    const valid = sanitizeProduct(product);
    expect(getAvailableComparableStorePrices(valid.prices, valid)).toHaveLength(1);
    for (const changed of [{ ...product, specs: {} }, { ...product, specs: { SKU: 'otro', ' SKU ': sku } },
      { ...product, name: name.replace('RGB RS', 'RGB*RS') }, { ...product, specs: { SKU: sku, kit: '2x8GB' } }]) {
      const invalid = sanitizeProduct(changed);
      expect(getAvailableComparableStorePrices(invalid.prices, invalid)).toEqual([]);
      expect(invalid.lowestPrice).toBe(0);
      expect(invalid.prices[0].identityReview?.status).toBe('needs-review');
    }
    expect(product.prices[0].identityReview?.status).toBe('consistent');
    expect(product.specs).toEqual({ SKU: sku });
  });
  it('conserva centavos observados para que la oferta y el mínimo representen el mismo importe', () => {
    const product = buildProduct();
    product.prices = [{ ...product.prices[0], price: 90_670.21 }];
    const sanitized = sanitizeProduct(product);
    expect(sanitized.prices[0].price).toBe(90_670.21);
    expect(sanitized.lowestPrice).toBe(90_670.21);
  });

  it('normaliza texto y recalcula stats comparables sin outliers absurdos', () => {
    const sanitized = sanitizeProduct(buildProduct());

    expect(sanitized.name).toBe('ASUS RTX 5070 Ti');
    expect(sanitized.brand).toBe('ASUS');
    expect(sanitized.specs).toEqual({ Memoria: '16 GB' });
    expect(sanitized.prices).toHaveLength(1);
    expect(sanitized.prices[0].storeId).toBe('venex');
    expect(sanitized.lowestPrice).toBe(1_250_000);
    expect(sanitized.highestPrice).toBe(1_250_000);
    expect(sanitized.averagePrice).toBe(1_250_000);
  });

  it('descarta precios invalidos y conserva stats previos si no quedan precios comparables', () => {
    const sanitized = sanitizeProduct(buildProduct({
      prices: [
        {
          storeId: 'venex',
          storeName: 'Venex',
          url: 'https://venex.com.ar/gpu',
          price: 0,
          installment: null,
          stock: 'in-stock',
          lastUpdated: new Date('2026-03-26T12:00:00.000Z'),
        },
      ],
      lowestPrice: 999_999,
      highestPrice: 999_999,
      averagePrice: 999_999,
    }));

    expect(sanitized.prices).toEqual([]);
    expect(sanitized.lowestPrice).toBe(999_999);
    expect(sanitized.highestPrice).toBe(999_999);
    expect(sanitized.averagePrice).toBe(999_999);
  });
});
