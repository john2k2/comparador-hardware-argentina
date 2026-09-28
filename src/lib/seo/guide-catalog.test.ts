import { describe, expect, it, vi } from 'vitest';
import type { Product } from '@/lib/types';

const mocks = vi.hoisted(() => ({ readGuideCatalogCandidatesFromDatabase: vi.fn() }));
vi.mock('@/lib/persistence/product-read', () => ({
  readGuideCatalogCandidatesFromDatabase: mocks.readGuideCatalogCandidatesFromDatabase,
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }));

import { loadGuideCatalogProducts, loadGuidePriorityProducts } from './guide-catalog';
import { getBudgetGuideBySlug } from './budget-guides-data';

describe('modelos prioritarios de la guía', () => {
  it('rescata GPUs específicas fuera del top general sin repetir consultas en el TTL', async () => {
    mocks.readGuideCatalogCandidatesFromDatabase.mockImplementation(async (_category: string, _limit: number, query: string) => [
      { id: `gpu-${query}`, name: query },
    ] as Product[]);

    const first = await loadGuidePriorityProducts('tarjetas-graficas', ['rtx 4060', 'rx 7600']);
    const second = await loadGuidePriorityProducts('tarjetas-graficas', ['rtx 4060', 'rx 7600']);

    expect(first.map((product) => product.id)).toEqual(['gpu-rtx 4060', 'gpu-rx 7600']);
    expect(second).toEqual(first);
    expect(mocks.readGuideCatalogCandidatesFromDatabase).toHaveBeenCalledTimes(2);
    expect(mocks.readGuideCatalogCandidatesFromDatabase).toHaveBeenCalledWith('tarjetas-graficas', 8, 'rtx 4060');
  });

  it('busca las siete piezas por sus modelos sin depender del top general de cada categoría', async () => {
    mocks.readGuideCatalogCandidatesFromDatabase.mockClear();
    const guide = getBudgetGuideBySlug('pc-gamer-1-millon')!;
    await loadGuideCatalogProducts(guide);
    expect(mocks.readGuideCatalogCandidatesFromDatabase).toHaveBeenCalledWith('memoria-ram', 8, 'mancer 16gb ddr4 3200 vant');
    expect(mocks.readGuideCatalogCandidatesFromDatabase).toHaveBeenCalledWith('gabinetes', 8, 'antec vx310');
    expect(mocks.readGuideCatalogCandidatesFromDatabase.mock.calls.every((call) => call[1] === 8 && call[2])).toBe(true);
    expect(new Set(mocks.readGuideCatalogCandidatesFromDatabase.mock.calls.map((call) => call[0])).size).toBe(7);
  });
});
