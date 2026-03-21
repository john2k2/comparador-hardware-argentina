import { type NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';

function generateNonce(): string {
  return randomBytes(16).toString('base64');
}

export function middleware(request: NextRequest) {
  const nonce = generateNonce();
  const cspScriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    'https://www.googletagmanager.com',
    'https://www.google-analytics.com',
  ].join(' ');

  const CSP_POLICY = [
    "default-src 'self'",
    `script-src ${cspScriptSrc}`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https://*.mlstatic.com https://i.imgur.com https://images.unsplash.com https://*.vteximg.com.br https://mexx-img-2019.s3.amazonaws.com https://imagenes.compragamer.com https://www.venex.com.ar https://www.fullh4rd.com.ar https://compugarden.com.ar https://*.compugarden.com.ar https://gamingcity.com.ar https://www.gamingcity.com.ar https://logg.api.cygnus.market https://katech.com.ar https://dinobyte.ar https://maxtecno.com.ar https://thegamershop.com.ar https://hardcorecomputacion.com.ar https://goldentechstore.com.ar https://www.armytech.com.ar https://beings.com.ar https://rockethard.com.ar https://hypergaming.com.ar https://hftecnologia.com.ar https://clickgaming.com.ar https://megasoftargentina.com.ar https://noxiestore.com https://nb.com.ar https://invidcomputers.com https://portalstore.com.ar https://*.acdn-us.mitiendanube.com https://www.acuarioinsumos.com.ar https://www.gamerspoint.com.ar https://liontech.com.ar https://www.scphardstore.com https://spacegamer.com.ar https://vrx.com.ar https://wiztech.com.ar https://www.xt-pc.com.ar https://cdn.qloud.ar https://statics.qloud.ar https://statics.qloud.com.ar https://statics2.qloud.com.ar https://app.contabilium.com",
    `script-src-elem 'self' 'nonce-${nonce}' https://www.googletagmanager.com https://www.google-analytics.com`,
    "connect-src 'self' https://www.google-analytics.com https://analytics.google.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  const response = NextResponse.next();

  response.headers.set('Content-Security-Policy', CSP_POLICY);
  response.headers.set('X-Content-Security-Policy-Nonce', nonce);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
}

export const config = {
  matcher: [
    // Match all paths except static files and images
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf)).*)',
  ],
};
