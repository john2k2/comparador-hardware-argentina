import { NextResponse } from 'next/server';
import {
  PRODUCT_SITEMAP_PAGE_SIZE,
  readIndexedProductCount,
  readProductSitemapPage,
} from '@/lib/seo/sitemap';
import { toAbsoluteUrl } from '@/lib/seo/url-utils';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function GET() {
  const countResult = await readIndexedProductCount();
  const fallbackHasProducts = countResult.count === null
    ? (await readProductSitemapPage(0, 1)).length > 0
    : false;
  const totalPages = countResult.count === null
    ? (fallbackHasProducts ? 1 : 0)
    : (countResult.count > 0 ? Math.ceil(countResult.count / PRODUCT_SITEMAP_PAGE_SIZE) : 0);
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
      // Un fallo transitorio no debe quedar cacheado como un índice sin catálogo.
      'Cache-Control': countResult.source === 'database'
        ? 'public, s-maxage=300, stale-while-revalidate=600'
        : 'no-store',
    },
  });
}
