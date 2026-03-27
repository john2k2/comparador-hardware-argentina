import { describe, expect, it } from 'vitest';
import { buildPublicSitemapEntries } from './public-sitemap';

describe('public sitemap surface', () => {
  it('only includes public static pages and category landings', () => {
    const entries = buildPublicSitemapEntries();
    const urls = entries.map((entry) => entry.url);

    expect(urls).toContain('https://comparador-hardware.com.ar/');
    expect(urls).toContain('https://comparador-hardware.com.ar/acerca');
    expect(urls).toContain('https://comparador-hardware.com.ar/search?category=procesadores');
    expect(urls.some((url) => url.includes('/admin'))).toBe(false);
    expect(urls.some((url) => url.includes('/auth'))).toBe(false);
    expect(urls.some((url) => url.includes('/api/'))).toBe(false);
  });
});
