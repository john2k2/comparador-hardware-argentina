import { describe, expect, it, vi } from 'vitest';
import type { Product } from '@/lib/types';

const mocks = vi.hoisted(() => ({ readProductsFromDatabase: vi.fn() }));
vi.mock('@/lib/persistence/product-read', () => ({
  readGuideCatalogCandidatesFromDatabase: vi.fn(async () => []),
  readProductsFromDatabase: mocks.readProductsFromDatabase,
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }));

import { loadGuidePriorityProducts } from './guide-catalog';

describe('modelos prioritarios de la guía', () => {
  it('rescata GPUs específicas fuera del top general sin repetir consultas en el TTL', async () => {
    mocks.readProductsFromDatabase.mockImplementation(async ({ query }: { query: string }) => [
      { id: `gpu-${query}`, name: query },
    ] as Product[]);

    const first = await loadGuidePriorityProducts('tarjetas-graficas', ['rtx 4060', 'rx 7600']);
    const second = await loadGuidePriorityProducts('tarjetas-graficas', ['rtx 4060', 'rx 7600']);

    expect(first.map((product) => product.id)).toEqual(['gpu-rtx 4060', 'gpu-rx 7600']);
    expect(second).toEqual(first);
    expect(mocks.readProductsFromDatabase).toHaveBeenCalledTimes(2);
    expect(mocks.readProductsFromDatabase).toHaveBeenCalledWith({ category: 'tarjetas-graficas', query: 'rtx 4060', limit: 8 });
  });
});
