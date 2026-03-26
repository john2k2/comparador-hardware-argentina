import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getOperationalMetricsSnapshot } from '@/lib/telemetry/operational-metrics';
import { resolveAdminAccessFromToken } from '@/lib/server/admin-auth';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const tokenFromHeader = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : null;
    const cookieStore = await cookies();
    const tokenFromCookie = cookieStore.get('sb-access-token')?.value ?? null;
    const adminUser = await resolveAdminAccessFromToken(tokenFromHeader || tokenFromCookie);

    if (!adminUser) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const snapshot = await getOperationalMetricsSnapshot();
    return NextResponse.json(snapshot);
  } catch (error) {
    logger.error('Admin operational API error', {
      endpoint: '/api/admin/operational',
      error,
    });
    return NextResponse.json(
      { error: 'Error al obtener metricas operativas' },
      { status: 500 },
    );
  }
}
