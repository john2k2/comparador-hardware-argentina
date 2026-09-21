import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '@/lib/types';
import { GUIDE_CATALOG_CATEGORIES } from '@/lib/seo/budget-guide-pricing';

const { readGuideCatalogCandidatesFromDatabaseMock } = vi.hoisted(() => ({
  readGuideCatalogCandidatesFromDatabaseMock: vi.fn(),
}));

vi.mock('@/lib/persistence/product-read', () => ({
  readGuideCatalogCandidatesFromDatabase: readGuideCatalogCandidatesFromDatabaseMock,
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function listed(id: string): Product {
  return {
    id,
    name: 'AMD Ryzen 5 5600',
    category: 'procesadores',
    brand: 'AMD',
    model: '5600',
    specs: {},
    prices: [],
    lowestPrice: 0,
    highestPrice: 0,
    averagePrice: 0,
    createdAt: new Date('2026-09-02T12:00:00.000Z'),
    updatedAt: new Date('2026-09-02T12:00:00.000Z'),
  };
}

describe('loadGuideCatalogProducts', () => {
  beforeEach(() => {
    vi.resetModules();
    readGuideCatalogCandidatesFromDatabaseMock.mockReset();
  });

  it('no cachea un catalogo vacio para reintentar en el proximo hit', async () => {
    readGuideCatalogCandidatesFromDatabaseMock.mockResolvedValue([]);
    const { loadGuideCatalogProducts } = await import('./guide-catalog');

    await expect(loadGuideCatalogProducts()).resolves.toEqual([]);
    await expect(loadGuideCatalogProducts()).resolves.toEqual([]);

    expect(readGuideCatalogCandidatesFromDatabaseMock).toHaveBeenCalledTimes(
      GUIDE_CATALOG_CATEGORIES.length * 2,
    );
  });

  it('reusa un catalogo con productos dentro del TTL', async () => {
    readGuideCatalogCandidatesFromDatabaseMock.mockResolvedValue([listed('cpu-1')]);
    const { loadGuideCatalogProducts } = await import('./guide-catalog');

    const first = await loadGuideCatalogProducts();
    const second = await loadGuideCatalogProducts();

    expect(first).toHaveLength(GUIDE_CATALOG_CATEGORIES.length);
    expect(second).toBe(first);
    expect(readGuideCatalogCandidatesFromDatabaseMock).toHaveBeenCalledTimes(
      GUIDE_CATALOG_CATEGORIES.length,
    );
    expect(readGuideCatalogCandidatesFromDatabaseMock).toHaveBeenCalledWith(
      GUIDE_CATALOG_CATEGORIES[0],
      24,
    );
  });
});
