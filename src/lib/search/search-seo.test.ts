import { describe, expect, it } from 'vitest';
import type { SearchPageState } from './search-state';
import { getCategorySeoCopy, isIndexableCategoryLanding } from './search-seo';

function buildState(overrides: Partial<SearchPageState> = {}): SearchPageState {
  return {
    query: '',
    category: 'procesadores',
    stores: [],
    sortBy: 'relevance',
    page: 1,
    ...overrides,
  };
}

describe('search-seo', () => {
  it('reconoce una landing de categoria indexable solo cuando no hay query ni filtros avanzados', () => {
    expect(isIndexableCategoryLanding(buildState())).toBe(true);
    expect(isIndexableCategoryLanding(buildState({ query: 'ryzen 7600' }))).toBe(false);
    expect(isIndexableCategoryLanding(buildState({ stores: ['mexx'] }))).toBe(false);
    expect(isIndexableCategoryLanding(buildState({ page: 2 }))).toBe(false);
  });

  it('expone copy SEO para categorias soportadas', () => {
    const copy = getCategorySeoCopy('procesadores');

    expect(copy).not.toBeNull();
    expect(copy?.heading).toContain('procesadores');
    expect(copy?.description).toContain('Argentina');
  });

  it('agrega FAQ de comparar procesadores sin cambiar el title', () => {
    const copy = getCategorySeoCopy('procesadores');

    expect(copy?.title).toBe('Procesadores AMD e Intel: precios');
    expect(copy?.faqs?.some((faq) => faq.question.toLowerCase().includes('comparar procesadores'))).toBe(true);
    expect(copy?.relatedLinks).toEqual(expect.arrayContaining([
      expect.objectContaining({ href: '/comparativa/i5-14600k-vs-ryzen-5-7600x' }),
      expect.objectContaining({ href: '/comparativa/ryzen-7-9800x3d-vs-i9-14900k' }),
    ]));
  });

  it('agrega FAQ de placas de video y otra comparativa de GPU', () => {
    const copy = getCategorySeoCopy('tarjetas-graficas');

    expect(copy?.title).toBe('Placas de video RTX y Radeon: precios');
    expect(copy?.faqs?.length).toBeGreaterThanOrEqual(2);
    expect(copy?.relatedLinks).toEqual(expect.arrayContaining([
      expect.objectContaining({ href: '/comparativa/rtx-5070-vs-rtx-4070' }),
    ]));
  });

  it.each([
    ['motherboards', 'Motherboards AMD e Intel: precios', 'comparar motherboards', '/comparativa/ddr5-vs-ddr4'],
    ['memoria-ram', 'Memoria RAM DDR4 y DDR5: precios', 'comparar memoria ram', '/comparativa/ddr5-vs-ddr4'],
    ['almacenamiento', 'SSD NVMe y SATA: precios', 'comparar ssd', '/guia/pc-gamer-2-millones'],
  ] as const)('agrega title y FAQ de %s sin tocar las landings de CPU/GPU', (category, title, faqNeedle, relatedHref) => {
    const copy = getCategorySeoCopy(category);

    expect(copy?.title).toBe(title);
    expect(copy?.heading.toLowerCase()).toContain('compará precios');
    expect(copy?.faqs?.some((faq) => faq.question.toLowerCase().includes(faqNeedle))).toBe(true);
    expect(copy?.relatedLinks).toEqual(expect.arrayContaining([
      expect.objectContaining({ href: relatedHref }),
    ]));
  });
});
