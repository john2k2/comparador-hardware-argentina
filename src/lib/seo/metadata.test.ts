import { describe, expect, it } from 'vitest';
import { buildCanonicalUrl, buildNoIndexMetadata, buildPublicPageMetadata } from './metadata';

describe('seo metadata helpers', () => {
  it('builds absolute canonical urls from relative paths', () => {
    expect(buildCanonicalUrl('/acerca')).toBe('https://www.comparador-hardware.com.ar/acerca');
    expect(buildCanonicalUrl('contacto')).toBe('https://www.comparador-hardware.com.ar/contacto');
  });

  it('builds indexable public metadata with canonical and robots', () => {
    const metadata = buildPublicPageMetadata({
      path: '/acerca',
      title: 'Acerca de',
      description: 'Info publica del comparador',
    });

    expect(metadata.alternates?.canonical).toBe('https://www.comparador-hardware.com.ar/acerca');
    expect(metadata.robots).toMatchObject({ index: true, follow: true });
  });

  it('builds noindex metadata for private or utility pages', () => {
    const metadata = buildNoIndexMetadata({
      path: '/auth',
      title: 'Auth',
      description: 'Ingreso privado',
    });

    expect(metadata.alternates?.canonical).toBe('https://www.comparador-hardware.com.ar/auth');
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });
});
