import type { MetadataRoute } from 'next';
import { categories } from '@/lib/scrapers/static-data';
import { getServerSupabaseReadClient } from '@/lib/server/supabase-server';

const BASE_URL = 'https://comparador-hardware.com.ar';
const PRODUCT_SITEMAP_LIMIT = 2000;

type ProductSitemapRow = {
  id: string;
  updated_at: string | null;
};

function toAbsoluteUrl(path: string): string {
  return `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

function toDate(value: string | null | undefined): Date {
  if (!value) return new Date();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
}

async function readProductEntries(): Promise<MetadataRoute.Sitemap> {
  const supabase = getServerSupabaseReadClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('products')
    .select('id, updated_at')
    .order('updated_at', { ascending: false })
    .limit(PRODUCT_SITEMAP_LIMIT);

  if (error) {
    console.warn('[sitemap] product list omitted:', error.message);
    return [];
  }

  const rows = (data ?? []) as ProductSitemapRow[];
  return rows.map((row) => ({
    url: toAbsoluteUrl(`/product/${encodeURIComponent(row.id)}`),
    lastModified: toDate(row.updated_at),
    changeFrequency: 'hourly',
    priority: 0.7,
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: toAbsoluteUrl('/'),
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 1,
    },
    {
      url: toAbsoluteUrl('/search'),
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.9,
    },
    {
      url: toAbsoluteUrl('/acerca'),
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: toAbsoluteUrl('/contacto'),
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: toAbsoluteUrl('/privacidad'),
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.2,
    },
    {
      url: toAbsoluteUrl('/terminos'),
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.2,
    },
  ];

  const categoryEntries: MetadataRoute.Sitemap = categories.map((category) => ({
    url: toAbsoluteUrl(`/search?category=${encodeURIComponent(category.id)}`),
    lastModified: now,
    changeFrequency: 'hourly',
    priority: 0.8,
  }));

  const productEntries = await readProductEntries();
  return [...staticEntries, ...categoryEntries, ...productEntries];
}
