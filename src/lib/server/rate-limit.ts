import type { NextRequest } from 'next/server';
import { getServerSupabaseServiceClient } from '@/lib/server/supabase-server';

type Bucket = {
  count: number;
  windowEndMs: number;
};

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

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

function compactBuckets(nowMs: number): void {
  if (buckets.size <= MAX_BUCKETS) return;

  for (const [key, bucket] of buckets) {
    if (bucket.windowEndMs <= nowMs) {
      buckets.delete(key);
    }
  }

  while (buckets.size > MAX_BUCKETS) {
    const oldestKey = buckets.keys().next().value as string | undefined;
    if (!oldestKey) break;
    buckets.delete(oldestKey);
  }
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

function checkRateLimitInMemory(key: string, rule: RateLimitRule): RateLimitResult {
  const nowMs = Date.now();
  compactBuckets(nowMs);

  const existing = buckets.get(key);
  if (!existing || existing.windowEndMs <= nowMs) {
    const resetAtMs = nowMs + rule.windowMs;
    buckets.set(key, { count: 1, windowEndMs: resetAtMs });
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
  buckets.set(key, existing);

  return {
    allowed: true,
    limit: rule.limit,
    remaining: Math.max(0, rule.limit - existing.count),
    resetAtMs: existing.windowEndMs,
    retryAfterSeconds: Math.max(1, Math.ceil((existing.windowEndMs - nowMs) / 1000)),
  };
}

export async function checkRateLimit(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
  const supabase = getServerSupabaseServiceClient();
  if (!supabase) {
    return checkRateLimitInMemory(key, rule);
  }

  const { data, error } = await supabase.rpc('check_api_rate_limit', {
    p_bucket_key: key,
    p_limit: rule.limit,
    p_window_seconds: Math.max(1, Math.ceil(rule.windowMs / 1000)),
  });

  if (error || !data || typeof data !== 'object') {
    return checkRateLimitInMemory(key, rule);
  }

  return {
    allowed: Boolean((data as { allowed?: boolean }).allowed),
    limit: Number((data as { limit?: number }).limit ?? rule.limit),
    remaining: Number((data as { remaining?: number }).remaining ?? 0),
    resetAtMs: Number((data as { resetAtMs?: number }).resetAtMs ?? Date.now() + rule.windowMs),
    retryAfterSeconds: Number((data as { retryAfterSeconds?: number }).retryAfterSeconds ?? Math.ceil(rule.windowMs / 1000)),
  };
}

export function buildRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAtMs / 1000)),
  };
}
