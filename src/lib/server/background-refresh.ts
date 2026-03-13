import type { NextRequest } from 'next/server';

export function shouldScheduleInternalBackgroundRefresh(request: NextRequest): boolean {
  if (process.env.NODE_ENV === 'test') return false;
  if (process.env.VITEST === 'true') return false;
  if (process.env.DISABLE_INTERNAL_BACKGROUND_REFRESH === '1') return false;
  if (request.headers.get('x-internal-refresh') === '1') return false;
  return true;
}
