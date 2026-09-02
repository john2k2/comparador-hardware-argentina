import { NextResponse } from 'next/server';
import { buildLlmsTxt } from '@/lib/seo/llms-txt';

export function GET() {
  return new NextResponse(buildLlmsTxt(), {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
