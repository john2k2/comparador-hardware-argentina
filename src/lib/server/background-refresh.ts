import type { NextRequest } from 'next/server';
import { isTrustedInternalRefreshRequest } from '@/lib/server/internal-refresh-auth';

export function shouldScheduleInternalBackgroundRefresh(request: NextRequest): boolean {
  if (process.env.NODE_ENV === 'test') return false;
  if (process.env.VITEST === 'true') return false;
  if (process.env.DISABLE_INTERNAL_BACKGROUND_REFRESH === '1') return false;
  // Cada refresh vuelve a entrar al mismo Worker y puede iniciar scraping de
  // varias tiendas. En Workers se habilita sólo cuando ese costo fue probado.
  if (process.env.ENABLE_INTERNAL_BACKGROUND_REFRESH !== '1') return false;
  if (isTrustedInternalRefreshRequest(request)) return false;
  return true;
}
