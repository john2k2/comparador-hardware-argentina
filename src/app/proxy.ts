import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { buildCspImgSrc } from '@/lib/image-domains';

function generateNonce(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

function buildScriptSources(nonce: string): string {
  const sources = [
    "'self'",
    `'nonce-${nonce}'`,
    'https://www.googletagmanager.com',
    'https://www.google-analytics.com',
  ];

  if (process.env.NODE_ENV !== 'production') {
    sources.push("'unsafe-eval'");
  }

  return sources.join(' ');
}

export function proxy(request: NextRequest) {
  const nonce = generateNonce();
  const cspScriptSrc = buildScriptSources(nonce);

  const cspPolicy = [
    "default-src 'self'",
    `script-src ${cspScriptSrc}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    buildCspImgSrc(),
    `script-src-elem 'self' 'nonce-${nonce}' https://www.googletagmanager.com https://www.google-analytics.com`,
    "connect-src 'self' https://www.google-analytics.com https://analytics.google.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-content-security-policy-nonce', nonce);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set('Content-Security-Policy', cspPolicy);
  response.headers.set('x-content-security-policy-nonce', nonce);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf)).*)',
  ],
};
