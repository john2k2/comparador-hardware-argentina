import type { MetadataRoute } from 'next';
import { categories } from '@/lib/scrapers/static-data';
import { toAbsoluteUrl } from '@/lib/seo/url-utils';
import { buildCategoryLandingPath } from '@/lib/seo/category-landing-routes';
import { COMPARISONS } from '@/lib/seo/comparisons-data';
import { BUDGET_GUIDES } from '@/lib/seo/budget-guides-data';
import { EDITORIAL_UPDATED_AT } from '@/lib/seo/editorial-freshness';
import { getStoreLanding } from '@/lib/seo/store-landings';

const EDITORIAL_LAST_MODIFIED = new Date(`${EDITORIAL_UPDATED_AT}T00:00:00.000Z`);

export function buildPublicSitemapEntries(indexableStores: string[] = []): MetadataRoute.Sitemap {
  const staticEntries: MetadataRoute.Sitemap = [
    { url: toAbsoluteUrl('/tiendas'), changeFrequency: 'weekly', priority: 0.7 },
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
      lastModified: EDITORIAL_LAST_MODIFIED,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: toAbsoluteUrl('/guia'),
      lastModified: EDITORIAL_LAST_MODIFIED,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: toAbsoluteUrl('/guia/armar'),
      lastModified: EDITORIAL_LAST_MODIFIED,
      changeFrequency: 'daily',
      priority: 0.85,
    },
    {
      url: toAbsoluteUrl('/indice-precios-hardware'),
      lastModified: EDITORIAL_LAST_MODIFIED,
      changeFrequency: 'daily',
      priority: 0.9,
    },
  ];

  const categoryEntries: MetadataRoute.Sitemap = categories.map((category) => ({
    url: toAbsoluteUrl(buildCategoryLandingPath(category.id)),
    lastModified: EDITORIAL_LAST_MODIFIED,
    changeFrequency: 'hourly',
    priority: 0.8,
  }));

  const comparisonEntries: MetadataRoute.Sitemap = COMPARISONS.map((comparison) => ({
    url: toAbsoluteUrl(`/comparativa/${comparison.slug}`),
    lastModified: EDITORIAL_LAST_MODIFIED,
    changeFrequency: 'daily',
    priority: 0.85,
  }));

  const budgetGuideEntries: MetadataRoute.Sitemap = BUDGET_GUIDES.map((guide) => ({
    url: toAbsoluteUrl(`/guia/${guide.slug}`),
    lastModified: EDITORIAL_LAST_MODIFIED,
    changeFrequency: 'daily',
    priority: 0.85,
  }));

  const storeEntries: MetadataRoute.Sitemap = [...new Set(indexableStores)].filter((id) => getStoreLanding(id)).map((id) => ({
    url: toAbsoluteUrl(`/tiendas/${id}`), changeFrequency: 'daily', priority: 0.7,
  }));
  return [...staticEntries, ...categoryEntries, ...comparisonEntries, ...budgetGuideEntries, ...storeEntries];
}
