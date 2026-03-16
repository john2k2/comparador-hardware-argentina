import type { NextRequest } from 'next/server';
import { withAbortTimeout } from '@/lib/async/with-abort-timeout';
import { shouldScheduleInternalBackgroundRefresh } from '@/lib/server/background-refresh';

type ScheduleInternalRefreshInput = {
  request: NextRequest;
  refreshKey: string;
  inFlightRefreshes: Map<string, Promise<void>>;
  timeoutMs: number;
  timeoutLabel: string;
  logPrefix: string;
};

export function scheduleInternalRefresh({
  request,
  refreshKey,
  inFlightRefreshes,
  timeoutMs,
  timeoutLabel,
  logPrefix,
}: ScheduleInternalRefreshInput): void {
  if (!shouldScheduleInternalBackgroundRefresh(request)) return;
  if (inFlightRefreshes.has(refreshKey)) return;

  const refreshUrl = new URL(request.url);
  refreshUrl.searchParams.set('bypassDb', '1');
  refreshUrl.searchParams.set('refresh', '1');

  const refreshPromise = withAbortTimeout(
    async (signal) => {
      const response = await fetch(refreshUrl.toString(), {
        method: 'GET',
        cache: 'no-store',
        headers: {
          'x-internal-refresh': '1',
        },
        signal,
      });
      if (!response.ok) {
        throw new Error(`refresh request failed with HTTP ${response.status}`);
      }
    },
    timeoutMs,
    timeoutLabel,
  )
    .catch((refreshError) => {
      console.warn(`${logPrefix} Background refresh error:`, refreshError);
    })
    .finally(() => {
      inFlightRefreshes.delete(refreshKey);
    });

  inFlightRefreshes.set(refreshKey, refreshPromise);
}
