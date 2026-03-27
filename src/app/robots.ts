import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site-config';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/search?category=', '/product/'],
        disallow: [
          '/admin',
          '/admin/',
          '/api',
          '/api/',
          '/auth',
          '/auth/',
        ],
      },
    ],
    sitemap: [
      `${SITE_URL}/sitemap.xml`,
      `${SITE_URL}/sitemap-index.xml`,
    ],
    host: SITE_URL,
  };
}
