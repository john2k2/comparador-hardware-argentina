import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

// Funciones extraidas para test unitario
const SESSION_COOKIE_NAME = 'sb-access-token';
const DEFAULT_SESSION_MAX_AGE_SECONDS = 60 * 60;

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

describe('auth session route', () => {
  describe('isSecureRequest', () => {
    it('detecta HTTPS via x-forwarded-proto', () => {
      const mockRequest = {
        headers: {
          get: (name: string) => name === 'x-forwarded-proto' ? 'https' : null,
        },
        nextUrl: { protocol: 'http:' as string },
      } as NextRequest;

      expect(isSecureRequest(mockRequest)).toBe(true);
    });

    it('detecta HTTP via x-forwarded-proto', () => {
      const mockRequest = {
        headers: {
          get: (name: string) => name === 'x-forwarded-proto' ? 'http' : null,
        },
        nextUrl: { protocol: 'http:' as string },
      } as NextRequest;

      expect(isSecureRequest(mockRequest)).toBe(false);
    });

    it('fallback a nextUrl cuando no hay header', () => {
      const mockRequest = {
        headers: {
          get: () => null,
        },
        nextUrl: { protocol: 'https:' as string },
      } as NextRequest;

      expect(isSecureRequest(mockRequest)).toBe(true);
    });
  });

  describe('computeMaxAgeSeconds', () => {
    it('usa default cuando expiresAt es null', () => {
      expect(computeMaxAgeSeconds(null)).toBe(DEFAULT_SESSION_MAX_AGE_SECONDS);
    });

    it('usa default cuando expiresAt es undefined', () => {
      expect(computeMaxAgeSeconds(undefined)).toBe(DEFAULT_SESSION_MAX_AGE_SECONDS);
    });

    it('calcula tiempo restante cuando expiresAt es valido', () => {
      const futureExpires = Math.floor(Date.now() / 1000) + 7200; // 2 horas en el futuro
      const maxAge = computeMaxAgeSeconds(futureExpires);

      expect(maxAge).toBeGreaterThan(60);
      expect(maxAge).toBeLessThanOrEqual(7200);
    });

    it('usa minimo de 60 segundos', () => {
      const pastExpires = Math.floor(Date.now() / 1000) - 100; // ya expiro
      const maxAge = computeMaxAgeSeconds(pastExpires);

      expect(maxAge).toBe(60);
    });
  });

  describe('session constants', () => {
    it('tiene nombre de cookie correcto', () => {
      expect(SESSION_COOKIE_NAME).toBe('sb-access-token');
    });

    it('tiene default session max age de 1 hora', () => {
      expect(DEFAULT_SESSION_MAX_AGE_SECONDS).toBe(3600);
    });
  });
});
