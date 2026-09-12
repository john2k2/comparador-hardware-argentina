import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const cache = new Map<string, unknown>();
  return {
    cache,
    getSharedCache: vi.fn(async (_scope: string, key: string) => cache.get(key)),
    setSharedCache: vi.fn(async (_scope: string, key: string, value: unknown) => {
      cache.set(key, value);
    }),
    deleteSharedCache: vi.fn(async (_scope: string, key: string) => {
      cache.delete(key);
    }),
  };
});

vi.mock('@/lib/server/shared-cache', () => ({
  getSharedCache: mocks.getSharedCache,
  setSharedCache: mocks.setSharedCache,
  deleteSharedCache: mocks.deleteSharedCache,
}));

import {
  clearStoreCircuit,
  getStoreCircuitBlock,
  recordStoreCircuitFailure,
} from './store-circuit-breaker';

describe('store scrape circuit breaker', () => {
  beforeEach(() => {
    mocks.cache.clear();
    mocks.getSharedCache.mockClear();
    mocks.setSharedCache.mockClear();
    mocks.deleteSharedCache.mockClear();
  });

  it('opens immediately after a storefront blocks scraping', async () => {
    const now = new Date('2026-09-12T12:00:00.000Z').getTime();
    await recordStoreCircuitFailure('Mexx', 'blocked', now);

    await expect(getStoreCircuitBlock('mexx', now + 60_000)).resolves.toMatchObject({
      failureCount: 1,
      lastStatus: 'blocked',
    });
  });

  it('opens after repeated parser or transport errors', async () => {
    const now = new Date('2026-09-12T12:00:00.000Z').getTime();
    await recordStoreCircuitFailure('venex', 'error', now);
    await recordStoreCircuitFailure('venex', 'error', now + 1_000);
    await recordStoreCircuitFailure('venex', 'error', now + 2_000);

    await expect(getStoreCircuitBlock('venex', now + 3_000)).resolves.toMatchObject({
      failureCount: 3,
      lastStatus: 'error',
    });
  });

  it('closes after a verified successful scrape', async () => {
    await recordStoreCircuitFailure('fullh4rd', 'blocked', Date.now());
    await clearStoreCircuit('fullh4rd');

    await expect(getStoreCircuitBlock('fullh4rd')).resolves.toBeNull();
  });
});
