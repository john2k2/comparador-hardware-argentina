import { describe, expect, it } from 'vitest';
import { SITE_BRAND_SHORT, SITE_URL, SUPPORT_EMAIL } from '@/lib/site-config';
import { buildSiteJsonLd } from './site-jsonld';

describe('buildSiteJsonLd', () => {
  it('genera Organization y WebSite', () => {
    const [organization, website] = buildSiteJsonLd();

    expect(organization['@type']).toBe('Organization');
    expect(organization.url).toBe(SITE_URL);
    expect(organization.alternateName).toBe(SITE_BRAND_SHORT);
    expect(organization.description).toMatch(/comparador independiente/i);
    expect(organization.knowsAbout).toEqual([
      'Comparación de precios de hardware',
      'Compatibilidad de componentes para PC',
      'Catálogo de hardware en Argentina',
    ]);
    if (SUPPORT_EMAIL) {
      expect(organization.contactPoint).toEqual({
        '@type': 'ContactPoint',
        email: SUPPORT_EMAIL,
        contactType: 'customer support',
      });
    } else {
      expect(organization.contactPoint).toBeUndefined();
    }

    expect(website['@type']).toBe('WebSite');
    expect(website.publisher).toEqual({ '@id': `${SITE_URL}#organization` });
  });

  it('evita publicar una plantilla de búsqueda como URL rastreable', () => {
    const [, website] = buildSiteJsonLd();
    expect(website).not.toHaveProperty('potentialAction');
  });

  it('Organization y WebSite comparten el mismo @id de referencia', () => {
    const [organization, website] = buildSiteJsonLd();
    expect(website.publisher['@id']).toBe(organization['@id']);
  });
});
