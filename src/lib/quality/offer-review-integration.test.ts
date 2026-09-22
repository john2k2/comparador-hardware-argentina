import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reviewProductOffers } from '@/lib/ai/review-product-offers';
import { JEV_MODEL } from '@/lib/ai/jev-client';
import { mapDbProduct } from '@/lib/persistence/product-read-mapper';
import type { DbProductRow } from '@/lib/persistence/product-read-types';
import { buildPriceStateSignature, planPriceRowPersistence } from '@/lib/persistence/product-write-dedupe';
import { resolveComparisonPricing } from '@/lib/seo/comparison-pricing';
import { resolveGuideComponent } from '@/lib/seo/budget-guide-pricing';
import type { Product, ProductPrice } from '@/lib/types';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/shared-cache', () => ({ getSharedCache: vi.fn(), setSharedCache: vi.fn(async () => undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));

const name = 'Patriot Viper Venom DDR5 32GB 6000MHz CL30';
const observedAt = new Date('2026-09-21T12:00:00Z');
const guide = { name, category: 'memoria-ram' as const, searchTerms: ['viper venom'], description: 'Memoria', estimatedPrice: 350_000 };

function offer(storeId: string, family: string, price: number): ProductPrice {
  return { storeId, storeName: storeId, url: `https://example.com/patriot-viper-${family}-ddr5-32gb-6000mhz-cl30`, price, stock: 'in-stock', installment: null, lastUpdated: observedAt };
}

function product(): Product {
  return {
    id: 'ram-patriot', name, category: 'memoria-ram', brand: 'Patriot', model: name, specs: {},
    prices: [offer('pending-store', 'elite', 100_000), offer('valid-store', 'venom', 300_000)],
    lowestPrice: 100_000, highestPrice: 300_000, averagePrice: 200_000,
    createdAt: observedAt, updatedAt: observedAt,
  };
}

function databaseRoundTrip(product: Product): Product {
  const row: DbProductRow = {
    id: product.id, name: product.name, category: product.category, brand: product.brand, model: product.model,
    description: null, image: null, normalized_title: null, canonical_product_key: null, family_key: null, variant_key: null,
    refresh_priority: null, last_scraped_at: null, last_normalized_at: null, specs: {},
    lowest_price: product.lowestPrice, highest_price: product.highestPrice, average_price: product.averagePrice,
    created_at: observedAt.toISOString(), updated_at: observedAt.toISOString(),
    product_prices: product.prices.map((price) => ({
      store_id: price.storeId, url: price.url, price: price.price, original_price: null, stock: price.stock,
      installment_count: null, installment_amount: null, last_updated: price.lastUpdated.toISOString(),
      identity_review: price.identityReview,
    })),
  };
  return mapDbProduct(JSON.parse(JSON.stringify(row)));
}

describe('revisión de ofertas entre IA, catálogo y recomendaciones', () => {
  beforeEach(() => {
    vi.stubEnv('ENABLE_JEV_OFFER_REVIEW', '1');
    vi.stubEnv('TYPESAFE_API_KEY', 'private-test-key');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      model: JEV_MODEL,
      answers: {
        offer_0: { type: 'choice', choice: 'identity_conflict', confidence: 0.95, probabilities: { identity_consistent: 0.01, identity_conflict: 0.98, identity_uncertain: 0.01 } },
        offer_1: { type: 'choice', choice: 'identity_consistent', confidence: 0.95, probabilities: { identity_consistent: 0.98, identity_conflict: 0.01, identity_uncertain: 0.01 } },
      },
      usage: { input_tokens: 100, output_tokens: 40 },
    }), { status: 200 })));
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('conserva la revisión y la fecha de oferta al serializar; la pendiente no gana ni arma un presupuesto', async () => {
    const input = product();
    const [reviewed] = await reviewProductOffers([input], { authorizedRefresh: true });
    const stored = databaseRoundTrip(reviewed);
    expect(stored.prices[0].identityReview?.status).toBe('needs-review');
    expect(stored.prices.every((price) => price.lastUpdated.getTime() === observedAt.getTime())).toBe(true);
    expect(input.prices.every((price) => price.identityReview === undefined)).toBe(true);
    const comparison = resolveComparisonPricing({
      product1Name: name, product2Name: 'Otra RAM', product1Prices: stored.prices,
      product2Prices: [offer('other-store', 'other', 250_000)],
    });
    expect(comparison.side1.bestPrice).toBe(300_000);
    expect(comparison.cheaperName).toBe('Otra RAM');
    expect(resolveGuideComponent(guide, [stored])).toMatchObject({ priceSource: 'catalog', price: 300_000, bestStoreName: 'valid-store' });

    stored.prices = stored.prices.filter((price) => price.storeId === 'pending-store');
    expect(resolveGuideComponent(guide, [stored])).toMatchObject({ priceSource: 'estimate', storeCount: 0, bestStoreName: null });
    expect(resolveComparisonPricing({ product1Name: name, product2Name: 'Otra', product1Prices: stored.prices, product2Prices: [offer('other', 'other', 250_000)] }).canDeclareWinner).toBe(false);
  });

  it('guarda un cambio de revisión sin crear un cambio artificial de precio', async () => {
    const [reviewed] = await reviewProductOffers([product()], { authorizedRefresh: true });
    const priceState = { price: 100_000, original_price: null, stock: 'in-stock' as const, installment_count: null, installment_amount: null };
    const plan = planPriceRowPersistence({ ...priceState, identity_review: reviewed.prices[0].identityReview }, {
      state_signature: buildPriceStateSignature(priceState), last_updated: observedAt.toISOString(), identity_review: null,
    }, observedAt);
    expect(plan).toMatchObject({ shouldUpsert: true, changed: false });
  });

  it('no confunde stock desconocido con disponible aunque no tenga revisión', () => {
    const comparison = resolveComparisonPricing({
      product1Name: name, product2Name: 'Otra',
      product1Prices: [{ ...offer('unknown', 'venom', 10_000), stock: 'unknown' }],
      product2Prices: [offer('other', 'other', 250_000)],
    });
    expect(comparison.canDeclareWinner).toBe(false);
    expect(comparison.side1.offerCount).toBe(0);
  });
});
