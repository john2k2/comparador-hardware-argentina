import { describe, expect, it } from 'vitest';
import { getPrimaryNavLinks, isNavLinkActive, PRIMARY_NAV_LINKS, SECONDARY_NAV_LINKS } from './primary-nav-links';

describe('PRIMARY_NAV_LINKS', () => {
  it('conserva todas las herramientas con rutas distintas y enlaces directos', () => {
    const links = [...PRIMARY_NAV_LINKS, ...SECONDARY_NAV_LINKS];
    const paths = links.map((link) => link.href);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toEqual(expect.arrayContaining([
      '/search', '/guia/armar', '/comparativa/comparar', '/comparativa', '/guia',
    ]));
    expect(SECONDARY_NAV_LINKS.some((link) => /índice de precios/i.test(link.label))).toBe(false);
  });

  it('el acceso de últimas ofertas apunta a la sección y Juegos respeta la habilitación del piloto', () => {
    expect(PRIMARY_NAV_LINKS.some((link) => link.href === '/#ultimas-ofertas')).toBe(true);
    expect(getPrimaryNavLinks(false).some((link) => link.href === '/juegos-digitales')).toBe(false);
    expect(getPrimaryNavLinks(true).filter((link) => link.href === '/juegos-digitales')).toHaveLength(1);
  });

  it.each([
    ['/guia/armar', '/guia/armar'],
    ['/guia/pc-gamer-1-millon', '/guia'],
    ['/comparar/procesadores', '/search'],
    ['/product/cpu-5600', '/search'],
    ['/comparativa/rtx-4060-vs-rx-7600', '/comparativa'],
    ['/comparativa/comparar', '/comparativa/comparar'],
    ['/juegos-digitales', '/juegos-digitales'],
  ])('ubica %s en una sola opción de navegación', (pathname, expected) => {
    const links = [...getPrimaryNavLinks(true), ...SECONDARY_NAV_LINKS];
    expect(links.filter(link => isNavLinkActive(link.href, pathname)).map(link => link.href)).toEqual([expected]);
  });
});
