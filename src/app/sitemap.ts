import type { MetadataRoute } from 'next';
import { buildPublicSitemapEntries } from '@/lib/seo/public-sitemap';

export const revalidate = 3600;

export default function sitemap(): MetadataRoute.Sitemap {
  return buildPublicSitemapEntries();
}
