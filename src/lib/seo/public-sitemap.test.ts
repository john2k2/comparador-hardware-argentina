import { describe, expect, it } from 'vitest';
import { buildPublicSitemapEntries } from './public-sitemap';
import { EDITORIAL_UPDATED_AT } from './editorial-freshness';

describe('public sitemap surface', () => {
  it('publica el comparador abierto y no promociona páginas de tiendas', () => {
    const urls = buildPublicSitemapEntries().map((entry) => entry.url);
    expect(urls).toContain('https://www.comparador-hardware.com.ar/comparativa/comparar');
    expect(urls.some((url) => url.includes('/tiendas'))).toBe(false);
  });
  it('only includes public static pages and category landings', () => {
    const entries = buildPublicSitemapEntries();
    const urls = entries.map((entry) => entry.url);

    expect(urls).toContain('https://www.comparador-hardware.com.ar/');
    expect(urls).toContain('https://www.comparador-hardware.com.ar/acerca');
    expect(urls).toContain('https://www.comparador-hardware.com.ar/indice-precios-hardware');
    expect(urls).toContain('https://www.comparador-hardware.com.ar/guia');
    expect(urls).toContain('https://www.comparador-hardware.com.ar/guia/armar');
    expect(urls).not.toContain('https://www.comparador-hardware.com.ar/about');
    expect(urls).toContain('https://www.comparador-hardware.com.ar/comparar/procesadores');
    expect(urls.some((url) => url.includes('/admin'))).toBe(false);
    expect(urls.some((url) => url.includes('/auth'))).toBe(false);
    expect(urls.some((url) => url.includes('/api/'))).toBe(false);
  });

  it('incluye una fecha de modificación verificable en las landings editoriales', () => {
    const entries = buildPublicSitemapEntries();
    const comparison = entries.find((entry) => entry.url.endsWith('/comparativa/rtx-4060-vs-rx-7600'));
    const guide = entries.find((entry) => entry.url.endsWith('/guia/pc-gamer-1-millon'));

    expect(comparison?.lastModified).toEqual(new Date(`${EDITORIAL_UPDATED_AT}T00:00:00.000Z`));
    expect(guide?.lastModified).toEqual(new Date(`${EDITORIAL_UPDATED_AT}T00:00:00.000Z`));
  });
});
