import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

const DISPATCH_URL = 'https://api.github.com/repos/john2k2/comparador-hardware-argentina/actions/workflows/requested-offer-refresh.yml/dispatches';

export type DispatchStatus = 'sent' | 'deferred' | 'unavailable';

// El límite distribuido impide que un visitante convierta una cola pública en
// ejecuciones ilimitadas de Actions. El schedule sigue siendo recuperación.
export async function dispatchRequestedRefresh(supabase: SupabaseClient): Promise<DispatchStatus> {
  const token = process.env.GITHUB_ACTIONS_DISPATCH_TOKEN?.trim();
  if (!token) return 'unavailable';
  try {
    const { data: shortGate, error: shortError } = await supabase.rpc('check_api_rate_limit', {
      p_bucket_key: 'requested-offer-refresh-dispatch-5m', p_limit: 1, p_window_seconds: 300,
    });
    if (shortError || !shortGate?.allowed) return 'deferred';
    const { data: dailyGate, error: dailyError } = await supabase.rpc('check_api_rate_limit', {
      p_bucket_key: 'requested-offer-refresh-dispatch-day', p_limit: 30, p_window_seconds: 86400,
    });
    if (dailyError || !dailyGate?.allowed) return 'deferred';
    const response = await fetch(DISPATCH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2026-03-10',
        'User-Agent': 'comparador-hardware-requested-refresh',
      },
      body: JSON.stringify({ ref: 'main' }),
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status === 204) return 'sent';
    logger.warn('Requested offer refresh dispatch was rejected', { status: response.status });
    return 'unavailable';
  } catch {
    logger.warn('Requested offer refresh dispatch failed');
    return 'unavailable';
  }
}
