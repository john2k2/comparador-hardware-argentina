import { describe, expect, it } from 'vitest';
import { getCategorySeoCopy } from '@/lib/search/search-seo';
import { getBudgetGuideBySlug } from './budget-guides-data';
import { getComparisonBySlug } from './comparisons-data';

describe('priority SEO landings', () => {
  it('conecta procesadores con comparativas y guias de compra relevantes', () => {
    const copy = getCategorySeoCopy('procesadores');

    expect(copy?.relatedLinks).toEqual(expect.arrayContaining([
      expect.objectContaining({ href: '/comparativa/ryzen-5-7600x-vs-ryzen-7-5700x' }),
      expect.objectContaining({ href: '/guia/pc-gamer-2-millones' }),
    ]));
  });

  it('conecta placas de video con las guias que ya reciben impresiones', () => {
    const copy = getCategorySeoCopy('tarjetas-graficas');

    expect(copy?.relatedLinks).toEqual(expect.arrayContaining([
      expect.objectContaining({ href: '/guia/pc-gamer-2-millones' }),
      expect.objectContaining({ href: '/guia/pc-gamer-3-millones' }),
    ]));
  });

  it('presenta la comparativa Ryzen como una decision de compra', () => {
    const comparison = getComparisonBySlug('ryzen-5-7600x-vs-ryzen-7-5700x');

    expect(comparison?.title).toBe('Ryzen 7600X vs 5700X: precios y cuál conviene');
    expect(comparison?.metadataTitle).toBe('Ryzen 7600X vs 5700X: cuál conviene | HardwareAR');
    expect(comparison?.description).toContain('AM5 o actualizar una PC AM4');
  });

  it('responde las FAQ del Ryzen y apunta a comparar procesadores', () => {
    const comparison = getComparisonBySlug('ryzen-5-7600x-vs-ryzen-7-5700x');
    const answers = comparison?.faqs.map((faq) => faq.answer.toLowerCase()) ?? [];

    expect(answers.length).toBeGreaterThanOrEqual(3);
    for (const answer of answers) {
      expect(answer).not.toMatch(/consult[aá] nuestro comparador/);
    }
    expect(answers.some((answer) => answer.includes('comparar procesadores'))).toBe(true);
  });

  it.each([
    ['pc-gamer-2-millones', 'PC Gamer por $2 millones: componentes y precios'],
    ['pc-gamer-3-millones', 'PC Gamer por $3 millones: componentes y precios'],
  ])('orienta %s a componentes y precios actuales', (slug, expectedTitle) => {
    const guide = getBudgetGuideBySlug(slug);

    expect(guide?.title).toBe(expectedTitle);
    expect(guide?.metadataTitle).toBe(`${slug.includes('-2-') ? 'PC Gamer $2M' : 'PC Gamer $3M'}: componentes y precios | HardwareAR`);
    expect(guide?.description).toContain('Compará componentes');
  });
});
