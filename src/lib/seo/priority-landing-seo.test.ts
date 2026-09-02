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

    expect(comparison?.title).toBe('Ryzen 5 7600X vs Ryzen 7 5700X: precios');
    expect(comparison?.metadataTitle).toBe('Ryzen 5 7600X vs Ryzen 7 5700X: precios | Comparador Hardware Argentina');
    expect(comparison?.description).toContain('AM5 o actualizar una PC AM4');
  });

  it('alinea titles con las consultas de Search Console que ya tienen impresiones', () => {
    expect(getCategorySeoCopy('procesadores')?.title.toLowerCase()).toContain('comparar procesadores');
    expect(getCategorySeoCopy('tarjetas-graficas')?.title.toLowerCase()).toContain('comparar placas de video');

    const twoMillion = getBudgetGuideBySlug('pc-gamer-2-millones');
    expect(twoMillion?.metadataTitle?.toLowerCase()).toContain('2 millones');
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

  it('en las comparativas no manda el snippet a “nuestro comparador”', () => {
    const slugs = [
      'rtx-4060-vs-rx-7600',
      'rtx-5070-vs-rtx-4070',
      'ryzen-7-9800x3d-vs-i9-14900k',
      'i5-14600k-vs-ryzen-5-7600x',
      'rtx-5090-vs-rx-9070-xt',
      'ddr5-vs-ddr4',
    ] as const;

    for (const slug of slugs) {
      const answers = getComparisonBySlug(slug)?.faqs.map((faq) => faq.answer.toLowerCase()) ?? [];
      expect(answers.length, slug).toBeGreaterThanOrEqual(2);
      for (const answer of answers) {
        expect(answer, slug).not.toMatch(/nuestro comparador/);
      }
    }
  });

  it.each([
    ['pc-gamer-2-millones', 'PC Gamer por $2 millones: componentes y precios'],
    ['pc-gamer-3-millones', 'PC Gamer por $3 millones: componentes y precios'],
  ])('orienta %s a componentes y precios actuales', (slug, expectedTitle) => {
    const guide = getBudgetGuideBySlug(slug);

    expect(guide?.title).toBe(expectedTitle);
    expect(guide?.metadataTitle).toBe(
      `${slug.includes('-2-') ? 'PC gamer 2 millones' : 'PC gamer 3 millones'}: componentes y precios | Comparador Hardware Argentina`,
    );
    expect(guide?.description).toContain('Compará componentes');
  });

  it('pone precios en el title de las comparativas que ya tienen impresiones', () => {
    const slugs = [
      'rtx-4060-vs-rx-7600',
      'rtx-5070-vs-rtx-4070',
      'ryzen-7-9800x3d-vs-i9-14900k',
      'rtx-5090-vs-rx-9070-xt',
    ] as const;

    for (const slug of slugs) {
      const comparison = getComparisonBySlug(slug);
      expect(comparison?.metadataTitle?.toLowerCase(), slug).toContain('precios');
    }
  });
});
