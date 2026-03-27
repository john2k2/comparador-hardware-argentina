import { NextResponse } from 'next/server';
import { countIndexedProducts, PRODUCT_SITEMAP_PAGE_SIZE } from '@/lib/seo/sitemap';
import { toAbsoluteUrl } from '@/lib/seo/url-utils';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function GET() {
  const totalProducts = await countIndexedProducts();
  const totalPages = totalProducts > 0 ? Math.ceil(totalProducts / PRODUCT_SITEMAP_PAGE_SIZE) : 0;
  const urls = [
    toAbsoluteUrl('/sitemap.xml'),
    ...Array.from({ length: totalPages }, (_, index) => toAbsoluteUrl(`/product-sitemap/${index}.xml`)),
  ];

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url) => `  <sitemap><loc>${escapeXml(url)}</loc></sitemap>`),
    '</sitemapindex>',
  ].join('\n');

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  });
}
