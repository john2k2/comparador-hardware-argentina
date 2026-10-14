import type { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import { getServerSupabaseServiceClient } from '@/lib/server/supabase-server';
import { isRedisEnabled, incrWithExpiry, getRedisTtlSeconds } from '@/lib/server/redis-cache';

export type RateLimitRule = {
  limit: number;
  windowMs: number;
};

export type RateLimitOptions = {
  // Las consultas privilegiadas no pueden degradar su control global a un isolate.
  fallback?: 'memory' | 'deny';
};

export type RateLimitResult = {
  unavailable?: true;
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAtMs: number;
  retryAfterSeconds: number;
};

// Fallback por proceso para lecturas públicas que aceptan degradación.
// Los callers con fallback deny requieren confirmación de un proveedor compartido.
type MemoryBucket = {
  count: number;
  windowEndMs: number;
};

const memoryBuckets = new Map<string, MemoryBucket>();
const MAX_MEMORY_BUCKETS = 1_000;

function compactMemoryBuckets(nowMs: number): void {
  if (memoryBuckets.size <= MAX_MEMORY_BUCKETS) return;

  for (const [key, bucket] of memoryBuckets) {
    if (bucket.windowEndMs <= nowMs) {
      memoryBuckets.delete(key);
    }
  }

  while (memoryBuckets.size > MAX_MEMORY_BUCKETS) {
    const oldestKey = memoryBuckets.keys().next().value as string | undefined;
    if (!oldestKey) break;
    memoryBuckets.delete(oldestKey);
  }
}

function checkRateLimitInMemory(key: string, rule: RateLimitRule): RateLimitResult {
  const nowMs = Date.now();
  compactMemoryBuckets(nowMs);

  const existing = memoryBuckets.get(key);
  if (!existing || existing.windowEndMs <= nowMs) {
    const resetAtMs = nowMs + rule.windowMs;
    memoryBuckets.set(key, { count: 1, windowEndMs: resetAtMs });
    return {
      allowed: true,
      limit: rule.limit,
      remaining: Math.max(0, rule.limit - 1),
      resetAtMs,
      retryAfterSeconds: Math.max(1, Math.ceil(rule.windowMs / 1000)),
    };
  }

  if (existing.count >= rule.limit) {
    return {
      allowed: false,
      limit: rule.limit,
      remaining: 0,
      resetAtMs: existing.windowEndMs,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.windowEndMs - nowMs) / 1000)),
    };
  }

  existing.count += 1;
  memoryBuckets.set(key, existing);

  return {
    allowed: true,
    limit: rule.limit,
    remaining: Math.max(0, rule.limit - existing.count),
    resetAtMs: existing.windowEndMs,
    retryAfterSeconds: Math.max(1, Math.ceil((existing.windowEndMs - nowMs) / 1000)),
  };
}

export function getRequestIp(request: NextRequest): string {
  // Cloudflare fija esta cabecera en la petición entrante. X-Forwarded-For puede
  // conservar un valor enviado por el cliente y no debe tener prioridad.
  const cloudflareIp = request.headers.get('cf-connecting-ip')?.trim();
  if (cloudflareIp) return cloudflareIp;

  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }

  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  return 'unknown';
}

export async function checkRateLimit(key: string, rule: RateLimitRule, options: RateLimitOptions = {}): Promise<RateLimitResult> {
  const fallback = (): RateLimitResult => options.fallback === 'deny' ? {
    allowed: false, unavailable: true, limit: rule.limit, remaining: 0,
    resetAtMs: Date.now() + rule.windowMs,
    retryAfterSeconds: Math.max(1, Math.ceil(rule.windowMs / 1000)),
  } : checkRateLimitInMemory(key, rule);
  if (isRedisEnabled()) {
    const windowSeconds = Math.max(1, Math.ceil(rule.windowMs / 1000));
    const count = await incrWithExpiry(key, windowSeconds);

    if (count !== null) {
      const ttlSeconds = await getRedisTtlSeconds(key);
      const effectiveTtlSeconds = ttlSeconds > 0 ? ttlSeconds : windowSeconds;

      return {
        allowed: count <= rule.limit,
        limit: rule.limit,
        remaining: Math.max(0, rule.limit - count),
        resetAtMs: Date.now() + effectiveTtlSeconds * 1000,
        retryAfterSeconds: effectiveTtlSeconds,
      };
    }

    logger.warn('[RateLimit] Contador Redis no disponible; comprobando proveedor alternativo');
  }

  const supabase = getServerSupabaseServiceClient();

  if (!supabase) return fallback();

  try {
    // Intentar usar la función RPC de Supabase para rate limiting distribuido
    const { data, error } = await supabase.rpc('check_api_rate_limit', {
      p_bucket_key: key,
      p_limit: rule.limit,
      p_window_seconds: Math.max(1, Math.ceil(rule.windowMs / 1000)),
    });

    // La autorización exige booleanos y números reales; un payload malformado
    // o allowed='false' jamás debe habilitar una consulta privilegiada.
    const result = data as RateLimitResult | null;
    if (error || !result || typeof result.allowed !== 'boolean'
      || !Number.isSafeInteger(result.limit) || result.limit !== rule.limit
      || !Number.isSafeInteger(result.remaining) || result.remaining < 0 || result.remaining >= rule.limit
      || !Number.isFinite(result.resetAtMs) || result.resetAtMs <= Date.now()
      || !Number.isSafeInteger(result.retryAfterSeconds) || result.retryAfterSeconds < 1) {
      logger.warn('[RateLimit] Respuesta distribuida no disponible o inválida');
      return fallback();
    }

    return { allowed: result.allowed, limit: result.limit, remaining: result.remaining,
      resetAtMs: result.resetAtMs, retryAfterSeconds: result.retryAfterSeconds };
  } catch {
    logger.warn('[RateLimit] Consulta distribuida no disponible');
    return fallback();
  }
}

export function buildRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAtMs / 1000)),
  };
}
