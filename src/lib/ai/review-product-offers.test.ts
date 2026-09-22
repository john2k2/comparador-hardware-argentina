import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product, ProductPrice } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  evaluateOfferIdentity: vi.fn(),
  getSharedCache: vi.fn(),
  setSharedCache: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('./jev-client', async (importOriginal) => ({
  ...await importOriginal<typeof import('./jev-client')>(),
  evaluateOfferIdentity: mocks.evaluateOfferIdentity,
}));
vi.mock('@/lib/server/shared-cache', () => ({
  getSharedCache: mocks.getSharedCache,
  setSharedCache: mocks.setSharedCache,
}));
vi.mock('@/lib/logger', () => ({ logger: { info: mocks.loggerInfo, warn: mocks.loggerWarn } }));

import { reviewProductOffers } from './review-product-offers';

function jevEvaluation(count: number, choices: Array<'identity_consistent' | 'identity_conflict' | 'identity_uncertain'> = []) {
  return {
    model: 'jev-1.13.0',
    answers: Array.from({ length: count }, (_, index) => ({
      choice: choices[index] ?? 'identity_consistent',
      confidence: 0.95,
      probabilities: { identity_consistent: 0.95, identity_conflict: 0.03, identity_uncertain: 0.02 },
    })),
    usage: { input_tokens: 12, output_tokens: 8 },
  };
}

function cachedResponse(count: number) {
  const result = jevEvaluation(count);
  return {
    ...result,
    answers: Object.fromEntries(result.answers.map((answer, index) => [`offer_${index}`, { type: 'choice', ...answer }])),
  };
}

function price(index: number, url = `https://store.example/amd-ryzen-7-7800x3d-${index}`): ProductPrice {
  return {
    storeId: `store-${index}`,
    storeName: 'Store',
    url,
    price: 350_000 + index,
    originalPrice: 400_000 + index,
    stock: 'in-stock',
    installment: null,
    lastUpdated: new Date(`2026-09-21T10:${String(index).padStart(2, '0')}:00.000Z`),
  };
}

function product(index: number, category: Product['category'] = 'procesadores', offer = price(index)): Product {
  return {
    id: `product-${index}`,
    name: category === 'tarjetas-graficas' ? 'NVIDIA GeForce RTX 4060 8GB' : 'AMD Ryzen 7 7800X3D',
    category,
    brand: category === 'tarjetas-graficas' ? 'NVIDIA' : 'AMD',
    model: category === 'tarjetas-graficas' ? 'RTX 4060' : 'Ryzen 7 7800X3D',
    specs: {},
    prices: [offer],
    lowestPrice: offer.price,
    highestPrice: offer.price,
    averagePrice: offer.price,
    createdAt: new Date('2026-09-20T00:00:00.000Z'),
    updatedAt: new Date('2026-09-21T00:00:00.000Z'),
  };
}

describe('reviewProductOffers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    process.env.ENABLE_JEV_OFFER_REVIEW = '1';
    process.env.TYPESAFE_API_KEY = 'private-test-key';
    mocks.getSharedCache.mockResolvedValue(undefined);
    mocks.setSharedCache.mockResolvedValue(undefined);
    mocks.evaluateOfferIdentity.mockImplementation(async (items: unknown[]) => jevEvaluation(items.length));
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.ENABLE_JEV_OFFER_REVIEW;
    delete process.env.TYPESAFE_API_KEY;
  });

  it('requires authorized refresh, the feature flag, and a provider key', async () => {
    const input = [product(1)];

    await expect(reviewProductOffers(input, { authorizedRefresh: false })).resolves.toBe(input);
    expect(mocks.evaluateOfferIdentity).not.toHaveBeenCalled();

    delete process.env.ENABLE_JEV_OFFER_REVIEW;
    await expect(reviewProductOffers(input, { authorizedRefresh: true })).resolves.toBe(input);

    process.env.ENABLE_JEV_OFFER_REVIEW = '1';
    delete process.env.TYPESAFE_API_KEY;
    await expect(reviewProductOffers(input, { authorizedRefresh: true })).resolves.toBe(input);
    expect(mocks.evaluateOfferIdentity).not.toHaveBeenCalled();
  });

  it('excludes deterministic conflicts before Jev and preserves the source objects and price fields', async () => {
    const valid = product(1);
    const conflict = product(2, 'procesadores', price(2, 'https://store.example/amd-ryzen-9-7950x3d'));
    const originalPrice = valid.prices[0];
    const sourcePriceSnapshot = { ...originalPrice };

    const result = await reviewProductOffers([valid, conflict], { authorizedRefresh: true });

    expect(mocks.evaluateOfferIdentity).toHaveBeenCalledTimes(1);
    expect(mocks.evaluateOfferIdentity.mock.calls[0][0]).toEqual([
      { name: 'AMD Ryzen 7 7800X3D', category: 'procesadores', offerText: 'amd ryzen 7 7800x3d 1' },
    ]);
    expect(result[1].prices[0].identityReview).toMatchObject({ status: 'needs-review', reason: 'explicit-conflict' });
    expect(valid.prices[0]).toBe(originalPrice);
    expect(valid.prices[0]).toEqual(sourcePriceSnapshot);
    expect(result[0]).not.toBe(valid);
    expect(result[0].prices[0]).not.toBe(originalPrice);
    expect(result[0].prices[0]).toMatchObject(sourcePriceSnapshot);
  });

  it('reviews at most 16 offers in batches of eight and leaves overflow untouched', async () => {
    const input = Array.from({ length: 17 }, (_, index) => product(index));

    const result = await reviewProductOffers(input, { authorizedRefresh: true });

    expect(mocks.evaluateOfferIdentity).toHaveBeenCalledTimes(2);
    expect(mocks.evaluateOfferIdentity.mock.calls.map(([items]) => (items as unknown[]).length)).toEqual([8, 8]);
    expect(result.slice(0, 16).every(({ prices }) => prices[0].identityReview?.status === 'consistent')).toBe(true);
    expect(result[16].prices[0].identityReview).toBeUndefined();
    expect(mocks.getSharedCache).toHaveBeenCalledTimes(2);
    expect(mocks.setSharedCache).toHaveBeenCalledTimes(2);
  });

  it('reuses a fresh cache response without calling Jev or renewing its reviewedAt', async () => {
    const savedAt = Date.parse('2026-09-20T12:00:00.000Z');
    vi.setSystemTime(new Date(savedAt + 5_000));
    mocks.getSharedCache.mockResolvedValue({ savedAt, response: cachedResponse(1) });
    const input = [product(1)];
    const sourceLastUpdated = input[0].prices[0].lastUpdated;

    const result = await reviewProductOffers(input, { authorizedRefresh: true });

    expect(mocks.evaluateOfferIdentity).not.toHaveBeenCalled();
    expect(mocks.setSharedCache).not.toHaveBeenCalled();
    expect(result[0].prices[0].identityReview).toMatchObject({
      status: 'consistent',
      reviewedAt: new Date(savedAt).toISOString(),
    });
    expect(result[0].prices[0].lastUpdated).toBe(sourceLastUpdated);
  });

  it('uses a distinct cache key when the evidence variant changes', async () => {
    await reviewProductOffers([product(1)], { authorizedRefresh: true });
    await reviewProductOffers([product(1, 'procesadores', price(1, 'https://store.example/amd-ryzen-7-7800x3d-v2'))], { authorizedRefresh: true });

    const keys = mocks.getSharedCache.mock.calls.map(([, key]) => key);
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('recalculates instead of trusting corrupt or expired cache entries', async () => {
    const now = Date.parse('2026-09-21T12:00:00.000Z');
    vi.setSystemTime(new Date(now));
    mocks.getSharedCache
      .mockResolvedValueOnce({ savedAt: now - 1_000, response: { corrupted: true } })
      .mockResolvedValueOnce({ savedAt: now - (24 * 60 * 60 * 1000 + 1), response: cachedResponse(1) });

    await reviewProductOffers([product(1)], { authorizedRefresh: true });
    await reviewProductOffers([product(2)], { authorizedRefresh: true });

    expect(mocks.evaluateOfferIdentity).toHaveBeenCalledTimes(2);
    expect(mocks.setSharedCache).toHaveBeenCalledTimes(2);
  });

  it('marks low confidence, model conflict, and uncertainty as needs-review', async () => {
    mocks.evaluateOfferIdentity.mockResolvedValueOnce({
      model: 'jev-1.13.0',
      answers: [
        { choice: 'identity_consistent', confidence: 0.79, probabilities: { identity_consistent: 0.9, identity_conflict: 0.05, identity_uncertain: 0.05 } },
        { choice: 'identity_conflict', confidence: 0.95, probabilities: { identity_consistent: 0.05, identity_conflict: 0.9, identity_uncertain: 0.05 } },
        { choice: 'identity_uncertain', confidence: 0.95, probabilities: { identity_consistent: 0.05, identity_conflict: 0.05, identity_uncertain: 0.9 } },
      ],
      usage: { input_tokens: 12, output_tokens: 8 },
    });

    const result = await reviewProductOffers([product(1), product(2), product(3)], { authorizedRefresh: true });

    expect(result.map(({ prices }) => prices[0].identityReview)).toMatchObject([
      { status: 'needs-review', reason: 'low-confidence', confidence: 0.79 },
      { status: 'needs-review', reason: 'model-conflict', confidence: 0.95 },
      { status: 'needs-review', reason: 'insufficient-evidence', confidence: 0.95 },
    ]);
  });

  it('marks provider errors pending and stops before retrying later batches', async () => {
    mocks.evaluateOfferIdentity.mockRejectedValueOnce(new Error('JEV_HTTP_429 provider private-test-key'));
    const input = Array.from({ length: 9 }, (_, index) => product(index));

    const result = await reviewProductOffers(input, { authorizedRefresh: true });

    expect(mocks.evaluateOfferIdentity).toHaveBeenCalledTimes(1);
    expect(result.every(({ prices }) => prices[0].identityReview?.status === 'needs-review')).toBe(true);
    expect(result.every(({ prices }) => prices[0].identityReview?.reason === 'provider-unavailable')).toBe(true);
    expect(mocks.loggerWarn).toHaveBeenCalledWith('Offer identity review unavailable', expect.objectContaining({ reason: 'provider-unavailable' }));
  });
});
