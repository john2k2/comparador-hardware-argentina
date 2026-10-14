import { describe, expect, it } from 'vitest';
import { getAllBudgetGuideSlugs, getBudgetGuideBySlug } from './budget-guides-data';
import { HOME_BUDGET_GUIDE_LINKS, HOME_CITATION_BLOCK, countWords } from './home-copy';

describe('home copy', () => {
  it('publica un bloque citable de 60 a 80 palabras', () => {
    const words = countWords(HOME_CITATION_BLOCK);
    expect(words).toBeGreaterThanOrEqual(60);
    expect(words).toBeLessThanOrEqual(80);
    expect(HOME_CITATION_BLOCK).toContain('Comparador Hardware Argentina');
    expect(HOME_CITATION_BLOCK.toLowerCase()).toContain('no vendemos');
  });

  it('solo enlaza guías que existen en el catálogo', () => {
    const published = new Set(getAllBudgetGuideSlugs());
    expect(HOME_BUDGET_GUIDE_LINKS).toHaveLength(3);
    for (const guide of HOME_BUDGET_GUIDE_LINKS) {
      expect(published.has(guide.slug)).toBe(true);
    }
  });

  it('deriva CPU y GPU de la selección editorial en todas las tarjetas', () => {
    for (const link of HOME_BUDGET_GUIDE_LINKS) {
      const guide = getBudgetGuideBySlug(link.slug)!;
      expect(link.target).toBe(`${guide.components.cpu.name} + ${guide.components.gpu.name}`);
      expect(link.title).toBe(`$${guide.budget.toLocaleString('es-AR')}`);
    }
    expect(HOME_BUDGET_GUIDE_LINKS.find(link => link.slug === 'pc-gamer-2-millones')!.target).toContain('5700');
  });
});
