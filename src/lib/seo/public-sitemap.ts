import type { MetadataRoute } from 'next';
import { categories } from '@/lib/scrapers/static-data';
import { toAbsoluteUrl } from '@/lib/seo/url-utils';

export function buildPublicSitemapEntries(): MetadataRoute.Sitemap {
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: toAbsoluteUrl('/'),
      changeFrequency: 'hourly',
      priority: 1,
    },
    {
      url: toAbsoluteUrl('/acerca'),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: toAbsoluteUrl('/about'),
      changeFrequency: 'monthly',
      priority: 0.2,
    },
    {
      url: toAbsoluteUrl('/contacto'),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: toAbsoluteUrl('/privacidad'),
      changeFrequency: 'monthly',
      priority: 0.2,
    },
    {
      url: toAbsoluteUrl('/terminos'),
      changeFrequency: 'monthly',
      priority: 0.2,
    },
  ];

  const categoryEntries: MetadataRoute.Sitemap = categories.map((category) => ({
    url: toAbsoluteUrl(`/search?category=${encodeURIComponent(category.id)}`),
    changeFrequency: 'hourly',
    priority: 0.8,
  }));

  return [...staticEntries, ...categoryEntries];
}
