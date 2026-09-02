import { describe, expect, it } from 'vitest';
import type { Product } from '@/lib/types';
import { getProductContent } from './product-seo-content';

function cpu(name: string): Product {
  return {
    id: 'cpu-1',
    name,
    category: 'procesadores',
    brand: 'AMD',
    model: name,
    specs: {},
    prices: [],
    lowestPrice: 0,
    highestPrice: 0,
    averagePrice: 0,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };
}

describe('getProductContent procesadores', () => {
  it('no habla de iGPU ni de cooler genérico en un 5500X3D S/VIDEO C/COOLER', () => {
    const content = getProductContent(cpu('AMD RYZEN 5 5500X3D S/VIDEO C/COOLER'));
    const blob = [content.intro, ...content.tips, ...content.faqs.map((faq) => `${faq.question} ${faq.answer}`)].join(' ');

    expect(blob).not.toMatch(/gráficos integrados/i);
    expect(blob).not.toMatch(/depende del modelo específico/i);
    expect(content.faqs.some((faq) => /incluye cooler/i.test(faq.question))).toBe(true);
    expect(content.faqs.find((faq) => /incluye cooler/i.test(faq.question))?.answer).toMatch(/incluye cooler/i);
  });

  it('dice que hay que comprar cooler cuando el listing es WOF', () => {
    const content = getProductContent(cpu('Ryzen 7 7700X WOF'));
    const coolerFaq = content.faqs.find((faq) => /cooler/i.test(faq.question));

    expect(coolerFaq?.answer).toMatch(/no incluye cooler/i);
  });
});
