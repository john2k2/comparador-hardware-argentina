import { NextRequest, NextResponse } from 'next/server';
import { cleanupPriceHistory } from '@/lib/persistence/price-history-maintenance';
import { pruneGhostStorePrices } from '@/lib/persistence/stale-product-prices-maintenance';
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
      const stalePrices = await pruneGhostStorePrices();
      logger.info('Catalog refresh cleanup completed', {
        endpoint: '/api/admin/catalog-refresh',
        requestedBy: access,
        mode: input.mode,
        deletedRows: cleanup.deletedRows,
        remainingRows: cleanup.remainingRows,
        stalePriceRows: stalePrices.deletedRows,
      });

      return NextResponse.json({
        refreshedAt: new Date().toISOString(),
        requestedBy: access,
        mode: input.mode,
        source: 'price-history-retention',
        cleanup,
        stalePrices,
      });
    }

    const plan = await buildRefreshPlan(input);
    if (plan.targets.length === 0) {
      logger.info('Catalog refresh skipped: no targets selected', {
        endpoint: '/api/admin/catalog-refresh',
        requestedBy: access,
        mode: input.mode,
        source: plan.source,
      });

      return NextResponse.json({
        refreshedAt: new Date().toISOString(),
        requestedBy: access,
        mode: input.mode,
        source: plan.source,
        fallbackApplied: plan.fallbackApplied,
        fallbackReason: plan.fallbackReason,
        totalTargets: 0,
        okTargets: 0,
        failedTargets: 0,
        input: {
          query: input.query ?? null,
          categories: input.categories,
          stores: input.stores,
          maxQueries: input.maxQueries,
          staleMinutes: input.staleMinutes,
        },
        results: [],
      });
    }

    const targets = plan.targets.slice(0, input.maxQueries);
    const results = await runTargets(request, targets, input.stores);
    const failedTargets = results.filter((item) => !item.ok);

    if (failedTargets.length > 0) {
      logger.warn('Catalog refresh completed with failed targets', {
        endpoint: '/api/admin/catalog-refresh',
        requestedBy: access,
        mode: input.mode,
        source: plan.source,
        failedTargets: failedTargets.map((item) => ({
          target: item.target,
          status: item.status,
          error: item.error,
        })),
      });
    }

    const stalePrices = input.mode === 'full' ? await pruneGhostStorePrices() : null;

    logger.info('Catalog refresh completed', {
      endpoint: '/api/admin/catalog-refresh',
      requestedBy: access,
      mode: input.mode,
      source: plan.source,
      totalTargets: results.length,
      okTargets: results.filter((item) => item.ok).length,
      failedTargets: failedTargets.length,
      stalePriceRows: stalePrices?.deletedRows ?? 0,
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
      failedTargets: failedTargets.length,
      input: {
        query: input.query ?? null,
        categories: input.categories,
        stores: input.stores,
        maxQueries: input.maxQueries,
        staleMinutes: input.staleMinutes,
      },
      results,
      stalePrices,
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
  void request;
  return NextResponse.json(
    { error: 'Metodo no permitido' },
    { status: 405, headers: { Allow: 'POST,OPTIONS' } },
  );
}

export async function POST(request: NextRequest) {
  return handleRefresh(request);
}

export async function OPTIONS() {
  return NextResponse.json(
    { ok: true },
    {
      headers: {
        Allow: 'POST,OPTIONS',
      },
    },
  );
}
