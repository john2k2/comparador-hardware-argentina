import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SITE_DESCRIPTION,
  HOME_PAGE_DESCRIPTION,
  HOME_PAGE_TITLE,
  buildCanonicalUrl,
  buildNoIndexMetadata,
  buildPublicPageMetadata,
} from './metadata';

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

  it('keeps home and fallback metadata concise and consistently branded', () => {
    const metadata = buildPublicPageMetadata({
      path: '/',
      title: HOME_PAGE_TITLE,
      description: HOME_PAGE_DESCRIPTION,
      absoluteTitle: true,
    });

    expect(metadata.title).toEqual({ absolute: HOME_PAGE_TITLE });
    expect(HOME_PAGE_TITLE).toContain('Comparador Hardware Argentina');
    expect(HOME_PAGE_TITLE.length).toBeLessThanOrEqual(60);
    expect(HOME_PAGE_DESCRIPTION.length).toBeLessThanOrEqual(155);
    expect(DEFAULT_SITE_DESCRIPTION.length).toBeLessThanOrEqual(155);
  });
});
