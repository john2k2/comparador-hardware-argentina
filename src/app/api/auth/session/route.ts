import { NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE_NAME = 'sb-access-token';
const DEFAULT_SESSION_MAX_AGE_SECONDS = 60 * 60;

type SessionCookiePayload = {
  accessToken?: string;
  expiresAt?: number | null;
};

function isSecureRequest(request: NextRequest): boolean {
  const proto = request.headers.get('x-forwarded-proto');
  if (proto) return proto === 'https';
  return request.nextUrl.protocol === 'https:';
}

function computeMaxAgeSeconds(expiresAtUnix: number | null | undefined): number {
  if (!expiresAtUnix || !Number.isFinite(expiresAtUnix)) {
    return DEFAULT_SESSION_MAX_AGE_SECONDS;
  }
  const expiresIn = Math.max(60, Math.trunc(expiresAtUnix - Date.now() / 1000));
  return expiresIn;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SessionCookiePayload;
    const accessToken = typeof body.accessToken === 'string' ? body.accessToken.trim() : '';
    if (!accessToken) {
      return NextResponse.json({ error: 'accessToken requerido' }, { status: 400 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE_NAME, accessToken, {
      httpOnly: true,
      secure: isSecureRequest(request),
      sameSite: 'lax',
      path: '/',
      maxAge: computeMaxAgeSeconds(body.expiresAt ?? null),
    });
    return response;
  } catch {
    return NextResponse.json({ error: 'Payload invalido' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: isSecureRequest(request),
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
