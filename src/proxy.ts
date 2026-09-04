import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { buildCspImgSrc } from '@/lib/image-domains';
import {
  INTERNAL_REFRESH_HEADER,
  isTrustedInternalRefreshRequest,
} from '@/lib/server/internal-refresh-auth';
import { resolveLegacyCategoryLandingRedirect } from '@/lib/seo/category-landing-routes';

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

function buildConnectSrc(): string {
  return [
    "'self'",
    'https://www.google-analytics.com',
    'https://analytics.google.com',
    'https://*.supabase.co',
    'wss://*.supabase.co',
  ].join(' ');
}

export function proxy(request: NextRequest) {
  // Legacy `/search?category=<id>` landings moved to their own clean URLs.
  // Handled here rather than in `next.config` redirects, which would forward
  // the original query string onto the destination.
  const landingRedirect = resolveLegacyCategoryLandingRedirect(
    request.nextUrl.pathname,
    request.nextUrl.searchParams,
  );
  if (landingRedirect) {
    return NextResponse.redirect(new URL(landingRedirect, request.url), 308);
  }

  const nonce = generateNonce();
  const cspScriptSrc = buildScriptSources(nonce);

  const cspPolicy = [
    "default-src 'self'",
    `script-src ${cspScriptSrc}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    buildCspImgSrc(),
    `script-src-elem 'self' 'nonce-${nonce}' https://www.googletagmanager.com https://www.google-analytics.com`,
    `connect-src ${buildConnectSrc()}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-content-security-policy-nonce', nonce);
  if (
    requestHeaders.has(INTERNAL_REFRESH_HEADER)
    && !isTrustedInternalRefreshRequest(request)
  ) {
    requestHeaders.delete(INTERNAL_REFRESH_HEADER);
  }

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
