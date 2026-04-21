import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { buildCspImgSrc } from '@/lib/image-domains';

function generateNonce(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

export function middleware(request: NextRequest) {
  const nonce = generateNonce();
  const cspScriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    'https://www.googletagmanager.com',
    'https://www.google-analytics.com',
  ].join(' ');

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