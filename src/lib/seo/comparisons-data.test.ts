import { describe, expect, it } from 'vitest';
import { COMPARISONS, getComparisonBySlug } from './comparisons-data';

describe('rtx-4060-vs-rx-7600 specs', () => {
  it('no trata el bus 128-bit como ventaja de una y desventaja de la otra', () => {
    const comparison = getComparisonBySlug('rtx-4060-vs-rx-7600');
    expect(comparison).toBeDefined();

    const mentions128 = (value: string) => /128/i.test(value);
    expect(comparison?.product1.cons.some(mentions128)).toBe(false);
    expect(comparison?.product2.pros.some(mentions128)).toBe(false);
    expect(comparison?.product1.specs).toMatch(/128-bit/i);
    expect(comparison?.product2.specs).toMatch(/128-bit/i);
  });
});

describe('comparativa benches de terceros', () => {
  it('cita TechPowerUp en cada comparativa y no deja cifras sueltas', () => {
    for (const comparison of COMPARISONS) {
      expect(comparison.sources.length, comparison.slug).toBeGreaterThan(0);
      expect(
        comparison.sources.every((source) => source.url.includes('techpowerup.com/review/')),
        comparison.slug,
      ).toBe(true);

      const blob = `${comparison.conclusion} ${comparison.faqs.map((faq) => faq.answer).join(' ')}`;
      expect(blob.toLowerCase(), comparison.slug).toMatch(/techpowerup/);
    }
  });

  it('usa el +22% raster 1440p de TPU en 5070 vs 4070, no un 25-30% inventado', () => {
    const comparison = getComparisonBySlug('rtx-5070-vs-rtx-4070');
    const blob = `${comparison?.conclusion} ${comparison?.faqs.map((faq) => faq.answer).join(' ')}`;

    expect(blob).not.toMatch(/25-30%/);
    expect(blob).toMatch(/22%/);
    expect(comparison?.sources.some((source) => source.url.includes('rtx-5070-founders-edition'))).toBe(true);
  });

  it('no invierte el 14600K vs 7600X con un 5-10% a favor del Ryzen', () => {
    const comparison = getComparisonBySlug('i5-14600k-vs-ryzen-5-7600x');
    const blob = `${comparison?.conclusion} ${comparison?.faqs.map((faq) => faq.answer).join(' ')}`;

    expect(blob).not.toMatch(/5-10%/);
    expect(blob).toMatch(/25%/);
  });

  it('corrige la VRAM de la 9070 XT y no inventa un 40-50% vs 5090', () => {
    const comparison = getComparisonBySlug('rtx-5090-vs-rx-9070-xt');
    const blob = `${comparison?.product2.specs} ${comparison?.conclusion} ${comparison?.faqs.map((faq) => faq.answer).join(' ')}`;

    expect(comparison?.product2.specs).toMatch(/16GB/i);
    expect(blob).not.toMatch(/24GB/);
    expect(blob).not.toMatch(/40-50%/);
  });
});
