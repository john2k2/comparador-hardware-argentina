import { NextRequest, NextResponse } from 'next/server';
import { ensureAccess } from '@/lib/admin/catalog-refresh/access';

export async function POST(request: NextRequest) {
  if (!await ensureAccess(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  // El Worker público no ejecuta scrapers; este proceso corre en el runner de actualización.
  if (process.env.CATALOG_REQUESTED_RUNNER !== '1') return NextResponse.json({ error: 'Requiere el proceso de actualización' }, { status: 409 });
  try {
    const { runRequestedRefresh } = await import('@/lib/catalog/on-demand/worker');
    return NextResponse.json(await runRequestedRefresh(), { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'No se pudo completar la actualización pedida' }, { status: 503 }); }
}
