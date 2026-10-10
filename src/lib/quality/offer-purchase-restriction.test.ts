import { describe, expect, it } from 'vitest';
import type { OfferSourceIdentity, ProductPrice } from '@/lib/types';
import type { DbProductRow } from '@/lib/persistence/product-read-types';
import { mapDbGuideProduct, mapDbProduct } from '@/lib/persistence/product-read-mapper';
import { computeCurrentStorePriceStats, isComparableStoreOffer } from '@/lib/price-utils';
import { bindReviewToSource, readIdentityReview, readSourceIdentity, sameSourceIdentity, type OfferIdentityReview } from './offer-identity';
import { proveOfferAttributes } from './offer-attribute-proof';

const name = 'AMD Ryzen 5 5600';
const product = { name, category: 'procesadores' };
const url = 'https://compragamer.com/producto/Procesador_AMD_Ryzen_5_5600_1';
const observedAt = '2026-10-10T20:00:00.000Z';
const source: OfferSourceIdentity = { listingRef: 'compragamer:id:1', title: name, sourceId: '1' };
const offer: ProductPrice = { storeId: 'compragamer', storeName: 'CompraGamer', url, price: 100000,
  stock: 'in-stock', installment: null, lastUpdated: new Date(observedAt), sourceIdentity: source };
const proof = proveOfferAttributes(name, product.category, name)!;
const review: OfferIdentityReview = { version: 1, status: 'consistent', reason: 'exact-attributes',
  reviewedAt: observedAt, model: null, confidence: null, subject: { ...product, name: 'amd ryzen 5 5600', url },
  sourceIdentity: source, proof };
function dbRow(restrictedSource: OfferSourceIdentity): DbProductRow {
  return { id: 'restricted-fixture', ...product, brand: 'AMD', model: '5600', description: null, image: null,
    normalized_title: null, canonical_product_key: null, family_key: null, variant_key: null,
    refresh_priority: null, last_scraped_at: null, last_normalized_at: null, specs: {},
    lowest_price: 100000, highest_price: 150000, average_price: 125000, created_at: observedAt, updated_at: observedAt,
    product_prices: [
      { store_id: offer.storeId, url, price: offer.price, stock: offer.stock, last_updated: observedAt,
        original_price: null, installment_count: null, installment_amount: null, source_identity: restrictedSource,
        identity_review: { ...review, sourceIdentity: restrictedSource } },
      { store_id: 'mexx', url: 'https://www.mexx.com.ar/producto/amd-ryzen-5-5600', price: 150000,
        stock: 'in-stock', last_updated: observedAt, original_price: null, installment_count: null, installment_amount: null },
    ] };
}

describe('restricciones explícitas de compra individual', () => {
  it.each(['build-only', 'combo-only'] as const)('preserva %s y rechaza aun con prueba exacta aprobada', purchaseRestriction => {
    const restrictedSource = { ...source, purchaseRestriction };
    expect(readSourceIdentity(restrictedSource)).toEqual(restrictedSource);
    expect(readIdentityReview({ ...review, sourceIdentity: restrictedSource })?.status).toBe('consistent');
    expect(isComparableStoreOffer({ ...offer, sourceIdentity: restrictedSource }, product)).toBe(false);
    expect(isComparableStoreOffer({ ...offer, sourceIdentity: restrictedSource,
      identityReview: { ...review, sourceIdentity: restrictedSource } }, product)).toBe(false);
    expect(isComparableStoreOffer({ ...offer, sourceIdentity: undefined,
      identityReview: { ...review, sourceIdentity: restrictedSource } }, product)).toBe(false);
    expect(isComparableStoreOffer({ ...offer, identityReview: { ...review, sourceIdentity: restrictedSource } }, product)).toBe(false);
    expect(sameSourceIdentity(source, restrictedSource)).toBe(false);
    expect(bindReviewToSource(review, restrictedSource, product, url)?.status).toBe('needs-review');
  });

  it.each(['build-only', 'combo-only'] as const)('ambos lectores DB conservan %s, importe, stock y fecha; mínimo y filtro usan alternativa', purchaseRestriction => {
    const row = dbRow({ ...source, purchaseRestriction });
    const original = structuredClone(row);
    for (const map of [mapDbProduct, mapDbGuideProduct]) {
      const mapped = map(row);
      expect(mapped.prices[0]).toMatchObject({ sourceIdentity: { ...source, purchaseRestriction }, price: 100000,
        stock: 'in-stock', lastUpdated: new Date(observedAt), url });
      const stats = computeCurrentStorePriceStats(mapped.prices, product, Date.parse(observedAt));
      expect(stats.lowest).toBe(150000);
      expect(stats.comparablePrices.map(item => item.storeId)).toEqual(['mexx']);
      expect(stats.lowest! <= 120000).toBe(false);
    }
    expect(row).toEqual(original);
  });

  it.each([null, 'unknown', 34, true, [], {}])('rechaza metadata malformada %j en fuente principal y review, incluso con fuente principal válida', purchaseRestriction => {
    const malformed = { ...source, purchaseRestriction } as unknown as OfferSourceIdentity;
    const invalidReview = { ...review, sourceIdentity: malformed };
    expect(readSourceIdentity(malformed)).toBeUndefined();
    expect(readIdentityReview(invalidReview)?.status).toBe('needs-review');
    expect(isComparableStoreOffer({ ...offer, identityReview: invalidReview }, product)).toBe(false);
    expect(isComparableStoreOffer({ ...offer, sourceIdentity: undefined, identityReview: invalidReview }, product)).toBe(false);
    for (const map of [mapDbProduct, mapDbGuideProduct]) {
      const mapped = map(dbRow(malformed));
      expect(mapped.prices[0].identityReview?.status).toBe('needs-review');
      expect(isComparableStoreOffer(mapped.prices[0], product)).toBe(false);
    }
  });

  it('ausencia conserva compra individual; metadata malformada se convierte en revisión, sin habilitar precio', () => {
    expect(isComparableStoreOffer(offer, product)).toBe(true);
    expect(isComparableStoreOffer({ ...offer, identityReview: review }, product)).toBe(true);
    expect(isComparableStoreOffer({ ...offer, sourceIdentity: undefined, identityReview: review }, product)).toBe(true);
    expect(readSourceIdentity({ ...source, purchaseRestriction: 'unknown' })).toBeUndefined();
    const malformed = { ...source, purchaseRestriction: 'unknown' } as unknown as OfferSourceIdentity;
    const mapped = mapDbGuideProduct(dbRow(malformed));
    expect(mapped.prices[0].identityReview?.status).toBe('needs-review');
    expect(isComparableStoreOffer(mapped.prices[0], product)).toBe(false);
  });
});
