import { describe, expect, it } from 'vitest';
import { PRIMARY_NAV_LINKS } from './primary-nav-links';

describe('PRIMARY_NAV_LINKS', () => {
  it('publica el índice de precios junto a comparativas y guías', () => {
    expect(PRIMARY_NAV_LINKS.map((link) => link.href)).toEqual([
      '/comparativa',
      '/guia',
      '/indice-precios-hardware',
    ]);
    expect(PRIMARY_NAV_LINKS.some((link) => /índice de precios/i.test(link.label))).toBe(true);
  });
});
