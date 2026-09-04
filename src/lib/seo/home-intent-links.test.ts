import { describe, expect, it } from 'vitest';
import { HOME_INTENT_LINKS, HOME_PROCESSOR_PROMO } from './home-intent-links';

describe('home intent links', () => {
  it('destaca las queries que ya tienen impresiones', () => {
    expect(HOME_INTENT_LINKS).toEqual([
      { href: '/comparar/procesadores', label: 'Comparar procesadores' },
      { href: '/comparar/placas-de-video', label: 'Comparar placas de video' },
      { href: '/comparativa/ryzen-5-7600x-vs-ryzen-7-5700x', label: 'Ryzen 5 7600X vs Ryzen 7 5700X' },
      { href: '/comparar/motherboards', label: 'Comparar motherboards' },
      { href: '/comparar/memoria-ram', label: 'Comparar memoria RAM' },
    ]);
  });

  it('manda el banner del home a procesadores', () => {
    expect(HOME_PROCESSOR_PROMO.href).toBe('/comparar/procesadores');
    expect(HOME_PROCESSOR_PROMO.cta.toLowerCase()).toContain('procesadores');
  });
});
