import { describe, expect, it } from 'vitest';
import { buildSiteJsonLd } from './site-jsonld';
import { SITE_URL } from '@/lib/site-config';

describe('buildSiteJsonLd', () => {
  it('genera Organization y WebSite con SearchAction', () => {
    const [organization, website] = buildSiteJsonLd();

    expect(organization['@type']).toBe('Organization');
    expect(organization.url).toBe(SITE_URL);

    expect(website['@type']).toBe('WebSite');
    expect(website.publisher).toEqual({ '@id': `${SITE_URL}#organization` });
  });

  it('el SearchAction apunta a /search?q= con el placeholder correcto', () => {
    const [, website] = buildSiteJsonLd();
    const action = website.potentialAction;

    expect(action['@type']).toBe('SearchAction');
    expect(action.target.urlTemplate).toBe(`${SITE_URL}/search?q={search_term_string}`);
    expect(action['query-input']).toBe('required name=search_term_string');
  });

  it('Organization y WebSite comparten el mismo @id de referencia', () => {
    const [organization, website] = buildSiteJsonLd();
    expect(website.publisher['@id']).toBe(organization['@id']);
  });
});
