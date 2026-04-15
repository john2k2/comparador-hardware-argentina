import { describe, expect, it } from 'vitest';
import robots from './robots';

describe('robots route', () => {
  it('blocks private surfaces and references both sitemaps', () => {
    const output = robots();
    const firstRule = Array.isArray(output.rules) ? output.rules[0] : output.rules;

    expect(firstRule?.disallow).toEqual(
      expect.arrayContaining(['/admin', '/admin/', '/api', '/api/', '/auth', '/auth/']),
    );
    expect(output.sitemap).toEqual([
      'https://www.comparador-hardware.com.ar/sitemap.xml',
      'https://www.comparador-hardware.com.ar/sitemap-index.xml',
    ]);
  });
});
