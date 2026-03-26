import { NextRequest, NextResponse } from 'next/server';
import { cleanupPriceHistory } from '@/lib/persistence/price-history-maintenance';
import { logger } from '@/lib/logger';
import { ensureAccess } from '@/lib/admin/catalog-refresh/access';
import { parseRefreshInput } from '@/lib/admin/catalog-refresh/input';
import { buildRefreshPlan } from '@/lib/admin/catalog-refresh/planning';
import { runTargets } from '@/lib/admin/catalog-refresh/execution';

async function handleRefresh(request: NextRequest) {
  const access = await ensureAccess(request);
  if (!access) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const input = await parseRefreshInput(request);
    if (input.mode === 'cleanup-history') {
      const cleanup = await cleanupPriceHistory();

      return NextResponse.json({
        refreshedAt: new Date().toISOString(),
        requestedBy: access,
        mode: input.mode,
        source: 'price-history-retention',
        cleanup,
      });
    }

    const plan = await buildRefreshPlan(input);
    const targets = plan.targets.slice(0, input.maxQueries);
    const results = await runTargets(request, targets, input.stores);

    logger.info('Catalog refresh completed', {
      endpoint: '/api/admin/catalog-refresh',
      requestedBy: access,
      mode: input.mode,
      source: plan.source,
      totalTargets: results.length,
      okTargets: results.filter((item) => item.ok).length,
      failedTargets: results.filter((item) => !item.ok).length,
    });

    return NextResponse.json({
      refreshedAt: new Date().toISOString(),
      requestedBy: access,
      mode: input.mode,
      source: plan.source,
      fallbackApplied: plan.fallbackApplied,
      fallbackReason: plan.fallbackReason,
      totalTargets: results.length,
      okTargets: results.filter((item) => item.ok).length,
      failedTargets: results.filter((item) => !item.ok).length,
      input: {
        query: input.query ?? null,
        categories: input.categories,
        stores: input.stores,
        maxQueries: input.maxQueries,
        staleMinutes: input.staleMinutes,
      },
      results,
    });
  } catch (error) {
    logger.error('Catalog refresh failed', {
      endpoint: '/api/admin/catalog-refresh',
      error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
    });

    return NextResponse.json(
      { error: 'Error al refrescar el catalogo' },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return handleRefresh(request);
}

export async function POST(request: NextRequest) {
  return handleRefresh(request);
}

export async function OPTIONS() {
  return NextResponse.json(
    { ok: true },
    {
      headers: {
        Allow: 'GET,POST,OPTIONS',
      },
    },
  );
}

