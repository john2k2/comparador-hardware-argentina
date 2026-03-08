import { NextRequest, NextResponse } from 'next/server';
import { readProductSitemapPage, toAbsoluteUrl, toDate } from '@/lib/seo/sitemap';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ page: string }> },
) {
  const { page } = await context.params;
  const pageIndex = Number(page.replace(/\.xml$/i, ''));
  if (!Number.isFinite(pageIndex) || pageIndex < 0) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const rows = await readProductSitemapPage(pageIndex);
  if (rows.length === 0) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...rows.map((row) => {
      const lastModified = toDate(row.updated_at);
      const parts = [
        '  <url>',
        `    <loc>${escapeXml(toAbsoluteUrl(`/product/${encodeURIComponent(row.id)}`))}</loc>`,
      ];

      if (lastModified) {
        parts.push(`    <lastmod>${escapeXml(lastModified.toISOString())}</lastmod>`);
      }

      parts.push('  </url>');
      return parts.join('\n');
    }),
    '</urlset>',
  ].join('\n');

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  });
}
