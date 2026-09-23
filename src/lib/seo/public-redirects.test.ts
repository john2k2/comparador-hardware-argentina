import { describe, expect, it } from 'vitest';
import { PUBLIC_REDIRECTS } from './public-redirects';

describe('public redirects', () => {
  it('manda /about a /acerca de forma permanente', () => {
    expect(PUBLIC_REDIRECTS).toEqual([
      { source: '/about', destination: '/acerca', permanent: true },
      { source: '/tiendas', destination: '/comparativa/comparar', permanent: true },
      { source: '/tiendas/:slug', destination: '/comparativa/comparar', permanent: true },
      { source: '/guia/pc-gamer-4-millones', destination: '/guia/armar?pesos=4000000', permanent: true },
    ]);
  });
});
