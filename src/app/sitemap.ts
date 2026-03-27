import type { MetadataRoute } from 'next';
import { buildPublicSitemapEntries } from '@/lib/seo/public-sitemap';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildPublicSitemapEntries();
}
