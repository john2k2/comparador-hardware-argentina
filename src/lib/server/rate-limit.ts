import type { NextRequest } from 'next/server';
import { getServerSupabaseServiceClient } from '@/lib/server/supabase-server';

export type RateLimitRule = {
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAtMs: number;
  retryAfterSeconds: number;
};

// Fallback en memoria SOLO para desarrollo o cuando Supabase no está disponible
// En producción con Vercel, esto es inefectivo pero mejor que nada como último recurso
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
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }

  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  return 'unknown';
}

export async function checkRateLimit(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
  const supabase = getServerSupabaseServiceClient();
  
  // Si no hay Supabase, usar fallback en memoria (con advertencia)
  if (!supabase) {
    console.warn('[RateLimit] Supabase no disponible, usando fallback en memoria (INSEGURO en serverless)');
    return checkRateLimitInMemory(key, rule);
  }

  try {
    // Intentar usar la función RPC de Supabase para rate limiting distribuido
    const { data, error } = await supabase.rpc('check_api_rate_limit', {
      p_bucket_key: key,
      p_limit: rule.limit,
      p_window_seconds: Math.max(1, Math.ceil(rule.windowMs / 1000)),
    });

    if (error || !data || typeof data !== 'object') {
      console.warn('[RateLimit] Error en RPC, usando fallback:', error?.message);
      return checkRateLimitInMemory(key, rule);
    }

    return {
      allowed: Boolean((data as { allowed?: boolean }).allowed),
      limit: Number((data as { limit?: number }).limit ?? rule.limit),
      remaining: Number((data as { remaining?: number }).remaining ?? 0),
      resetAtMs: Number((data as { resetAtMs?: number }).resetAtMs ?? Date.now() + rule.windowMs),
      retryAfterSeconds: Number((data as { retryAfterSeconds?: number }).retryAfterSeconds ?? Math.ceil(rule.windowMs / 1000)),
    };
  } catch (err) {
    console.warn('[RateLimit] Excepción, usando fallback:', err);
    return checkRateLimitInMemory(key, rule);
  }
}

export function buildRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAtMs / 1000)),
  };
}
