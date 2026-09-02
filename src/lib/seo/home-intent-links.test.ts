import { describe, expect, it } from 'vitest';
import { HOME_INTENT_LINKS, HOME_PROCESSOR_PROMO } from './home-intent-links';

describe('home intent links', () => {
  it('destaca las queries que ya tienen impresiones', () => {
    expect(HOME_INTENT_LINKS).toEqual([
      { href: '/search?category=procesadores', label: 'Comparar procesadores' },
      { href: '/search?category=tarjetas-graficas', label: 'Comparar placas de video' },
      { href: '/comparativa/ryzen-5-7600x-vs-ryzen-7-5700x', label: 'Ryzen 5 7600X vs Ryzen 7 5700X' },
      { href: '/search?category=motherboards', label: 'Comparar motherboards' },
      { href: '/search?category=memoria-ram', label: 'Comparar memoria RAM' },
    ]);
  });

  it('manda el banner del home a procesadores', () => {
    expect(HOME_PROCESSOR_PROMO.href).toBe('/search?category=procesadores');
    expect(HOME_PROCESSOR_PROMO.cta.toLowerCase()).toContain('procesadores');
  });
});
