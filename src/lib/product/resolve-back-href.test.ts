import { describe, expect, it } from 'vitest';
import { resolveBackHref } from './product-cache-utils';

describe('resolveBackHref', () => {
  it('vuelve a la búsqueda cuando no hay origen', () => {
    expect(resolveBackHref(null)).toBe('/search');
    expect(resolveBackHref('')).toBe('/search');
  });

  it('preserva el origen de búsqueda con sus filtros', () => {
    expect(resolveBackHref('/search?category=procesadores&page=2'))
      .toBe('/search?category=procesadores&page=2');
  });

  it('preserva las landings de categoría como origen', () => {
    expect(resolveBackHref('/comparar/placas-de-video')).toBe('/comparar/placas-de-video');
    expect(resolveBackHref(encodeURIComponent('/comparar/procesadores')))
      .toBe('/comparar/procesadores');
  });

  it('rechaza destinos externos para no habilitar un open redirect', () => {
    expect(resolveBackHref('https://evil.example/phishing')).toBe('/search');
    expect(resolveBackHref('//evil.example')).toBe('/search');
    expect(resolveBackHref('/admin')).toBe('/search');
    expect(resolveBackHref('/comparardor-falso')).toBe('/search');
    expect(resolveBackHref('javascript:alert(1)')).toBe('/search');
  });
});
