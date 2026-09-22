import type { MetadataRoute } from 'next';
import { buildPublicSitemapEntries } from '@/lib/seo/public-sitemap';
import { readStoreCatalog } from '@/lib/seo/store-catalog';
import { STORE_LANDINGS } from '@/lib/seo/store-landings';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const stores = await Promise.all(STORE_LANDINGS.map(async (store) => (await readStoreCatalog(store.id)).indexable ? store.id : null));
  return buildPublicSitemapEntries(stores.filter((id): id is NonNullable<typeof id> => id !== null));
}
