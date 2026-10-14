import { afterEach, describe, expect, it, vi } from 'vitest';
import { mapDbProduct } from '@/lib/persistence/product-read-mapper';
import type { DbProductRow } from '@/lib/persistence/product-read-types';
import { proveManufacturerRamAttributes } from '@/lib/quality/offer-attribute-proof';
import { normalizeIdentityText } from '@/lib/product-identity';
import { getRecentProductOffers } from './product-page-metadata';
import { buildOfferPresentation } from './offer-presentation';
import { compareProducts } from '@/lib/comparison/dynamic-comparison';
import { resolveComparisonPricing } from '@/lib/seo/comparison-pricing';
import { filterProductStores } from '@/lib/search/search-dedupe';

const now = Date.parse('2026-10-12T02:00:00Z');
const fixtures = [
  ['group-15558', 'CMG16GX4M1E3200C16', '15558', 'Memoria Corsair DDR4 16GB 3200MHz Vengeance RGB RS Black CL16', 283600],
  ['cg-15558', 'CMG16GX4M1E3200C16', '15558', 'Memoria Corsair DDR4 16GB 3200MHz Vengeance RGB RS Black CL16', 283600],
  ['cg-15522', 'CMK8GX4M1E3200C16', '15522', 'Memoria Corsair DDR4 8GB 3200MHz Vengeance LPX Black CL16', 129990],
  ['cg-16112', 'CMK16GX5M1B5600C40', '16112', 'Memoria Corsair DDR5 16GB 5600MHz Vengeance CL40 Intel XMP 3.0', 428000],
] as const;
function row(fixture: typeof fixtures[number]): DbProductRow {
  const [id, sku, listing, name, price] = fixture;
  const url = `https://compragamer.com/producto/${name.replaceAll(' ', '_')}_${listing}`;
  const sourceIdentity = { listingRef: `compragamer:id:${listing}`, title: name, storeSku: sku };
  const subject = { title: name, sku, specs: { SKU: sku } };
  const proof = proveManufacturerRamAttributes(subject, subject,
    { storeId: 'compragamer', url, listingRef: sourceIdentity.listingRef });
  expect(proof).not.toBeNull();
  const observed = new Date(now - 60_000).toISOString();
  return { id, name, category: 'memoria-ram', brand: 'Corsair', model: name, description: null, image: null,
    normalized_title: name, canonical_product_key: null, family_key: null, variant_key: null,
    refresh_priority: null, last_scraped_at: observed, last_normalized_at: null, specs: { SKU: sku },
    lowest_price: price, highest_price: price, average_price: price, created_at: observed, updated_at: observed,
    product_prices: [{ store_id: 'compragamer', url, price, original_price: null, stock: 'in-stock',
      installment_count: null, installment_amount: null, last_updated: observed, source_identity: sourceIdentity,
      price_condition: 'special', identity_review: { version: 1, status: 'consistent', reason: 'manufacturer-ram',
        reviewedAt: observed, model: null, confidence: null,
        subject: { name: normalizeIdentityText(name), category: 'memoria-ram', url }, sourceIdentity, proof } }] };
}
afterEach(() => vi.restoreAllMocks());
describe('RAM por SKU en consumidores públicos', () => {
  it.each(fixtures)('mantiene %s desde mapper hasta ficha y comparación', (...fixture) => {
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const product = mapDbProduct(row(fixture));
    expect(getRecentProductOffers(product)).toHaveLength(1);
    expect(buildOfferPresentation(product, product.prices, now).lowest).toBe(fixture[4]);
    expect(filterProductStores(product, new Set(['compragamer']))?.lowestPrice).toBe(fixture[4]);
    const pricing = resolveComparisonPricing({ product1Name: product.name, product2Name: product.name,
      product1Prices: product.prices, product2Prices: product.prices, product1: product, product2: product });
    expect(pricing.side1.bestPrice).toBe(fixture[4]);expect(pricing.storeCount).toBe(1);
    expect(compareProducts(product, product, 'equilibrado', now).leftPrice).toBe(fixture[4]);
    expect(product.prices[0].priceCondition).toBe('special');
    expect(product.prices[0].lastUpdated.toISOString()).toBe(new Date(now - 60000).toISOString());
  });
  it.each([{}, { SKU: 'wrong-mpn' }, { SKU: fixtures[0][1], kit: '2x8' }])('rechaza producto actual incompatible: %j', specs => {
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const raw = row(fixtures[0]);raw.specs = specs;
    const product = mapDbProduct(raw);
    expect(getRecentProductOffers(product)).toHaveLength(0);
    expect(buildOfferPresentation(product, product.prices, now).bestOffer).toBeUndefined();
  });
});
