import { NextRequest, NextResponse } from 'next/server';
import { ensureAccess } from '@/lib/admin/catalog-refresh/access';

export async function POST(request: NextRequest) {
  if (!await ensureAccess(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (process.env.CATALOG_REQUESTED_RUNNER !== '1') return NextResponse.json({ error: 'Requiere el proceso de actualización' }, { status: 409 });
  try {
    const { runPriorityRefresh } = await import('@/lib/catalog/priority-refresh');
    const result = await runPriorityRefresh(request.nextUrl.searchParams.get('sample') === '1');
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const deferred = error instanceof Error && error.message === 'PRIORITY_REFRESH_DEFERRED';
    return NextResponse.json({ error: deferred ? 'Actualización prioritaria ya solicitada recientemente' : 'No se pudo completar la actualización prioritaria' },
      { status: deferred ? 429 : 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
