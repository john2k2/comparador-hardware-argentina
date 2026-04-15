import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  getRequestIp,
  buildRateLimitHeaders,
  checkRateLimit,
  type RateLimitRule,
  type RateLimitResult,
} from './rate-limit';

// Mock de Supabase para que use siempre el fallback en memoria
vi.mock('@/lib/server/supabase-server', () => ({
  getServerSupabaseServiceClient: vi.fn(() => null),
}));

// Acceder al mapa interno de buckets para tests de estado
// (no se exporta, pero podemos testear comportamiento observable)

describe('rate-limit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-14T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getRequestIp', () => {
    it('extrae IP de x-forwarded-for', () => {
      const mockRequest = {
        headers: {
          get: (name: string) => {
            if (name === 'x-forwarded-for') return '192.168.1.1, 10.0.0.1';
            return null;
          },
        },
      } as NextRequest;

      expect(getRequestIp(mockRequest)).toBe('192.168.1.1');
    });

    it('usa x-real-ip como fallback', () => {
      const mockRequest = {
        headers: {
          get: (name: string) => {
            if (name === 'x-real-ip') return '10.0.0.5';
            return null;
          },
        },
      } as NextRequest;

      expect(getRequestIp(mockRequest)).toBe('10.0.0.5');
    });

    it('retorna unknown cuando no hay headers', () => {
      const mockRequest = {
        headers: {
          get: () => null,
        },
      } as NextRequest;

      expect(getRequestIp(mockRequest)).toBe('unknown');
    });

    it('maneja x-forwarded-for vacio', () => {
      const mockRequest = {
        headers: {
          get: (name: string) => {
            if (name === 'x-forwarded-for') return '';
            return null;
          },
        },
      } as NextRequest;

      expect(getRequestIp(mockRequest)).toBe('unknown');
    });
  });

  describe('buildRateLimitHeaders', () => {
    it('construye headers correctamente', () => {
      const result: RateLimitResult = {
        allowed: true,
        limit: 30,
        remaining: 25,
        resetAtMs: Date.now() + 60_000,
        retryAfterSeconds: 60,
      };

      const headers = buildRateLimitHeaders(result);

      expect(headers).toEqual({
        'X-RateLimit-Limit': '30',
        'X-RateLimit-Remaining': '25',
        'X-RateLimit-Reset': String(Math.ceil(result.resetAtMs / 1000)),
      });
    });

    it('maneja valores cero', () => {
      const result: RateLimitResult = {
        allowed: false,
        limit: 10,
        remaining: 0,
        resetAtMs: 1_000_000,
        retryAfterSeconds: 30,
      };

      const headers = buildRateLimitHeaders(result);

      expect(headers['X-RateLimit-Limit']).toBe('10');
      expect(headers['X-RateLimit-Remaining']).toBe('0');
      expect(headers['X-RateLimit-Reset']).toBe('1000');
    });
  });

  describe('checkRateLimit (in-memory)', () => {
    const rule: RateLimitRule = { limit: 5, windowMs: 60_000 };

    it('permite requests dentro del limite', async () => {
      for (let i = 0; i < 5; i++) {
        const result = await checkRateLimit('test-user-1', rule);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4 - i);
      }
    });

    it('bloquea cuando se supera el limite', async () => {
      // Consumir el limite
      for (let i = 0; i < 5; i++) {
        await checkRateLimit('test-user-2', rule);
      }

      // Este deberia estar bloqueado
      const result = await checkRateLimit('test-user-2', rule);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('reinicia despues de la ventana de tiempo', async () => {
      // Consumir limite
      for (let i = 0; i < 5; i++) {
        await checkRateLimit('test-user-3', rule);
      }

      // Verificar bloqueado
      const blocked = await checkRateLimit('test-user-3', rule);
      expect(blocked.allowed).toBe(false);

      // Avanzar el tiempo mas alla de la ventana (60s)
      vi.advanceTimersByTime(61_000);

      // Deberia permitir de nuevo
      const result = await checkRateLimit('test-user-3', rule);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it('keys diferentes tienen limites independientes', async () => {
      const result1 = await checkRateLimit('user-a', rule);
      const result2 = await checkRateLimit('user-b', rule);

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
      // Cada uno tiene su propio contador
      expect(result1.remaining).toBe(4);
      expect(result2.remaining).toBe(4);
    });

    it('retryAfterSeconds es al menos 1', async () => {
      const result = await checkRateLimit('test-user-4', rule);
      expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    });

    it('limit y remaining son correctos en cada paso', async () => {
      const rule2: RateLimitRule = { limit: 3, windowMs: 30_000 };

      const r1 = await checkRateLimit('test-user-5', rule2);
      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(2);

      const r2 = await checkRateLimit('test-user-5', rule2);
      expect(r2.allowed).toBe(true);
      expect(r2.remaining).toBe(1);

      const r3 = await checkRateLimit('test-user-5', rule2);
      expect(r3.allowed).toBe(true);
      expect(r3.remaining).toBe(0);

      const r4 = await checkRateLimit('test-user-5', rule2);
      expect(r4.allowed).toBe(false);
      expect(r4.remaining).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('maneja reglas con limite 1', async () => {
      const strictRule: RateLimitRule = { limit: 1, windowMs: 10_000 };

      const r1 = await checkRateLimit('strict-user', strictRule);
      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(0);

      const r2 = await checkRateLimit('strict-user', strictRule);
      expect(r2.allowed).toBe(false);
    });

    it('ventana muy corta se reinicia rapido', async () => {
      const shortRule: RateLimitRule = { limit: 2, windowMs: 1_000 };

      await checkRateLimit('short-user', shortRule);
      await checkRateLimit('short-user', shortRule);

      const blocked = await checkRateLimit('short-user', shortRule);
      expect(blocked.allowed).toBe(false);

      vi.advanceTimersByTime(1_100);

      const allowed = await checkRateLimit('short-user', shortRule);
      expect(allowed.allowed).toBe(true);
    });
  });
});
