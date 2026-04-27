import type { MetadataRoute } from 'next';
import { categories } from '@/lib/scrapers/static-data';
import { toAbsoluteUrl } from '@/lib/seo/url-utils';
import { COMPARISONS } from '@/lib/seo/comparisons-data';
import { BUDGET_GUIDES } from '@/lib/seo/budget-guides-data';

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
    {
      url: toAbsoluteUrl('/comparativa'),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: toAbsoluteUrl('/guia'),
      changeFrequency: 'daily',
      priority: 0.9,
    },
  ];

  const categoryEntries: MetadataRoute.Sitemap = categories.map((category) => ({
    url: toAbsoluteUrl(`/search?category=${encodeURIComponent(category.id)}`),
    changeFrequency: 'hourly',
    priority: 0.8,
  }));

  const comparisonEntries: MetadataRoute.Sitemap = COMPARISONS.map((comparison) => ({
    url: toAbsoluteUrl(`/comparativa/${comparison.slug}`),
    changeFrequency: 'daily',
    priority: 0.85,
  }));

  const budgetGuideEntries: MetadataRoute.Sitemap = BUDGET_GUIDES.map((guide) => ({
    url: toAbsoluteUrl(`/guia/${guide.slug}`),
    changeFrequency: 'daily',
    priority: 0.85,
  }));

  return [...staticEntries, ...categoryEntries, ...comparisonEntries, ...budgetGuideEntries];
}
