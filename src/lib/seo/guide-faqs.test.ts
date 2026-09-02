import { describe, expect, it } from 'vitest';
import type { ResolvedGuideComponent } from './budget-guide-pricing';
import { canPublishGuideFps, resolveGuideFaqs } from './guide-faqs';

function slot(
  overrides: Pick<ResolvedGuideComponent, 'name' | 'priceSource'>,
): ResolvedGuideComponent {
  return {
    description: '',
    price: 150_000,
    bestStoreName: overrides.priceSource === 'catalog' ? 'Mexx' : null,
    bestStoreUrl: overrides.priceSource === 'catalog' ? 'https://mexx.com.ar/x' : null,
    storeCount: overrides.priceSource === 'catalog' ? 1 : 0,
    storeNames: overrides.priceSource === 'catalog' ? ['Mexx'] : [],
    offers: [],
    ...overrides,
  };
}

const faqs = [
  {
    question: '¿Se puede armar una PC gamer con 1 millón de pesos?',
    answer: 'Sí, con 1 millón podés armar una excelente PC para gaming 1080p con Ryzen 5 5600 y RX 6600.',
  },
  {
    question: '¿Qué placa de video comprar para PC de 1 millón?',
    answer: 'La AMD RX 6600 8GB es la mejor opción. Ofrece excelente rendimiento 1080p y buena relación precio/performance.',
  },
  {
    question: '¿Cuántos FPS da una PC de 1 millón en Fortnite?',
    answer: 'Con Ryzen 5 5600 + RX 6600 obtenés 120+ FPS en 1080p High.',
  },
];

describe('resolveGuideFaqs', () => {
  it('no recomienda CPU/GPU estimados ni copia el BOM estático', () => {
    const resolved = resolveGuideFaqs(
      faqs,
      slot({ name: 'AMD Ryzen 5 5500', priceSource: 'catalog' }),
      slot({ name: 'AMD RX 6600 8GB', priceSource: 'estimate' }),
    );

    const answers = resolved.map((faq) => faq.answer).join(' ');
    expect(answers).toContain('AMD Ryzen 5 5500');
    expect(answers).toMatch(/sin stock/i);
    expect(answers).not.toContain('Ryzen 5 5600');
    expect(answers).not.toMatch(/mejor opción/i);
    expect(answers).not.toContain('120+ FPS');
  });

  it('nombra los SKUs en stock cuando CPU y GPU salen del catálogo', () => {
    const resolved = resolveGuideFaqs(
      faqs,
      slot({ name: 'AMD Ryzen 5 5500', priceSource: 'catalog' }),
      slot({ name: 'Gigabyte RX 6600 Eagle', priceSource: 'catalog' }),
    );

    const answers = resolved.map((faq) => faq.answer).join(' ');
    expect(answers).toContain('AMD Ryzen 5 5500');
    expect(answers).toContain('Gigabyte RX 6600 Eagle');
    expect(answers).not.toContain('Ryzen 5 5600');
  });

  it('solo publica FPS cuando CPU y GPU salen del catálogo', () => {
    expect(canPublishGuideFps(
      slot({ name: 'AMD Ryzen 5 5500', priceSource: 'catalog' }),
      slot({ name: 'Gigabyte RX 6600 Eagle', priceSource: 'catalog' }),
    )).toBe(true);

    expect(canPublishGuideFps(
      slot({ name: 'AMD Ryzen 5 5500', priceSource: 'catalog' }),
      slot({ name: 'AMD RX 6600 8GB', priceSource: 'estimate' }),
    )).toBe(false);
  });

  it('no publica FPS de un combo distinto al editorial', () => {
    expect(canPublishGuideFps(
      slot({ name: 'AMD Ryzen 5 7600X', priceSource: 'catalog' }),
      slot({ name: 'MSI RTX 4060 Ventus 8GB', priceSource: 'catalog' }),
      { cpuTerms: ['ryzen 5 5600', 'ryzen 5 5500'], gpuTerms: ['rx 6600'] },
    )).toBe(false);

    expect(canPublishGuideFps(
      slot({ name: 'AMD Ryzen 5 5500', priceSource: 'catalog' }),
      slot({ name: 'Gigabyte RX 6600 Eagle', priceSource: 'catalog' }),
      { cpuTerms: ['ryzen 5 5600', 'ryzen 5 5500'], gpuTerms: ['rx 6600'] },
    )).toBe(true);
  });
});
