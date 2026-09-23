import { SITE_BRAND_SHORT, SITE_NAME, SITE_URL, SUPPORT_EMAIL } from '@/lib/site-config';

export function buildSiteJsonLd() {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': `${SITE_URL}#organization`,
      name: SITE_NAME,
      alternateName: SITE_BRAND_SHORT,
      url: SITE_URL,
      logo: `${SITE_URL}/og-image.png`,
      description: 'Comparador independiente de precios y stock de hardware entre tiendas argentinas.',
      knowsAbout: [
        'Comparación de precios de hardware',
        'Compatibilidad de componentes para PC',
        'Catálogo de hardware en Argentina',
      ],
      ...(SUPPORT_EMAIL
        ? {
            contactPoint: {
              '@type': 'ContactPoint',
              email: SUPPORT_EMAIL,
              contactType: 'customer support',
            },
          }
        : {}),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': `${SITE_URL}#website`,
      url: SITE_URL,
      name: SITE_NAME,
      publisher: { '@id': `${SITE_URL}#organization` },
    },
  ];
}
