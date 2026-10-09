import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readGuideCatalogCandidatesFromDatabase: vi.fn(async () => []) }));
vi.mock('@/lib/persistence/product-read', () => ({
  readGuideCatalogCandidatesFromDatabase: mocks.readGuideCatalogCandidatesFromDatabase,
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }));

import { loadGuideCatalogProducts } from './guide-catalog';
import { getBudgetGuideBySlug } from './budget-guides-data';

describe('consulta de la selección editorial de guías', () => {
  it('filtra 650W Gold antes del límite de ocho candidatas sin renovar la selección ni su presupuesto', async () => {
    const guide = getBudgetGuideBySlug('pc-gamer-2-millones')!;
    const original = structuredClone(guide);
    await loadGuideCatalogProducts(guide);

    expect(mocks.readGuideCatalogCandidatesFromDatabase).toHaveBeenCalledWith('fuentes-alimentacion', 8, '650w gold');
    expect(mocks.readGuideCatalogCandidatesFromDatabase.mock.calls).not.toContainEqual(['fuentes-alimentacion', 8, '650w']);
    expect(guide.components.psu).toMatchObject({ name: '650W 80 Plus Gold', estimatedPrice: 100_000 });
    expect(guide.budget).toBe(2_000_000);
    expect(guide).toEqual(original);
  });
});
