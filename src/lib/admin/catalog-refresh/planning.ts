import { getServerSupabaseReadClient, getServerSupabaseServiceClient } from '@/lib/server/supabase-server';
import { loadCatalogRefreshDemands } from '@/lib/catalog/refresh-demand';
import { logger } from '@/lib/logger';
import { isHardwareCategory } from '@/lib/admin/catalog-refresh/input';
import {
  ALL_CATEGORIES,
  type RefreshInput,
  type RefreshPlan,
  type RefreshTarget,
} from '@/lib/admin/catalog-refresh/types';

export type RefreshTargetLoadStatus = 'ready' | 'empty' | 'unavailable';

export type RefreshTargetLoadResult = {
  status: RefreshTargetLoadStatus;
  targets: RefreshTarget[];
  reason?: string;
};

export type RefreshTargetLoader = {
  loadDemandTargets: (maxQueries: number) => Promise<RefreshTargetLoadResult>;
  loadTrackedTargets: (maxQueries: number) => Promise<RefreshTargetLoadResult>;
  loadHotTargets: (maxQueries: number, staleMinutes: number) => Promise<RefreshTargetLoadResult>;
};

export function dedupeTargets(targets: RefreshTarget[]): RefreshTarget[] {
  const seen = new Set<string>();
  const unique: RefreshTarget[] = [];

  for (const target of targets) {
    const key = target.kind === 'category'
      ? `category:${target.value}`
      : `query:${target.category ?? ''}:${target.value.toLowerCase()}`;

    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(target);
  }

  return unique;
}

export function toCategoryTargets(categories: RefreshInput['categories']): RefreshTarget[] {
  const selected = categories.length > 0 ? categories : ALL_CATEGORIES;
  return selected.map((category) => ({
    kind: 'category',
    value: category,
    category,
  }));
}

export function toSafeQuery(name: string): string {
  return name
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export function toQueryTarget(product: { name: string; category: string | null }): RefreshTarget | null {
  const query = toSafeQuery(product.name);
  if (!query) return null;
  const category = isHardwareCategory(product.category) ? product.category : undefined;

  return {
    kind: 'query',
    value: query,
    category,
  };
}

function readyResult(targets: RefreshTarget[]): RefreshTargetLoadResult {
  return {
    status: 'ready',
    targets,
  };
}

function emptyResult(reason: string): RefreshTargetLoadResult {
  return {
    status: 'empty',
    targets: [],
    reason,
  };
}

function unavailableResult(reason: string): RefreshTargetLoadResult {
  return {
    status: 'unavailable',
    targets: [],
    reason,
  };
}

export async function loadTrackedTargets(maxQueries: number): Promise<RefreshTargetLoadResult> {
  const supabase = getServerSupabaseServiceClient();
  if (!supabase) {
    logger.warn('Catalog refresh: tracked target load unavailable', {
      endpoint: '/api/admin/catalog-refresh',
      reason: 'service_client_unavailable',
    });
    return unavailableResult('service_client_unavailable');
  }

  const [favoritesResult, alertsResult] = await Promise.all([
    supabase
      .from('user_favorites')
      .select('product_id')
      .limit(Math.max(maxQueries * 4, 100)),
    supabase
      .from('price_alerts')
      .select('product_id')
      .eq('is_active', true)
      .limit(Math.max(maxQueries * 4, 100)),
  ]);

  if (favoritesResult.error || alertsResult.error) {
    logger.warn('Catalog refresh: tracked source query failed', {
      endpoint: '/api/admin/catalog-refresh',
      favoritesError: favoritesResult.error?.message ?? null,
      alertsError: alertsResult.error?.message ?? null,
    });
    return unavailableResult('tracked_source_query_failed');
  }

  const trackedIds = new Set<string>();

  for (const row of favoritesResult.data ?? []) {
    const id = String(row.product_id ?? '').trim();
    if (id) trackedIds.add(id);
  }

  for (const row of alertsResult.data ?? []) {
    const id = String(row.product_id ?? '').trim();
    if (id) trackedIds.add(id);
  }

  if (trackedIds.size === 0) return emptyResult('no_tracked_ids');

  const ids = Array.from(trackedIds).slice(0, Math.max(maxQueries * 2, 50));
  const { data: products, error } = await supabase
    .from('products')
    .select('id,name,category')
    .in('id', ids)
    .limit(Math.max(maxQueries * 2, 50));

  if (error || !products) {
    logger.warn('Catalog refresh: tracked target load failed', {
      endpoint: '/api/admin/catalog-refresh',
      error: error?.message ?? 'unknown',
    });
    return unavailableResult('tracked_products_query_failed');
  }

  const targets = dedupeTargets(
    products
      .map((row) => toQueryTarget({
        name: String(row.name ?? ''),
        category: typeof row.category === 'string' ? row.category : null,
      }))
      .filter((target): target is RefreshTarget => Boolean(target))
      .slice(0, maxQueries),
  );

  if (targets.length === 0) return emptyResult('no_valid_tracked_queries');

  return readyResult(targets);
}

export async function loadDemandTargets(maxQueries: number): Promise<RefreshTargetLoadResult> {
  const demands = await loadCatalogRefreshDemands(maxQueries);
  if (demands === null) return unavailableResult('demand_source_unavailable');
  if (demands.length === 0) return emptyResult('no_recent_catalog_demand');

  const targets = dedupeTargets(
    demands.map((demand) => {
      if (demand.query) {
        return {
          kind: 'query' as const,
          value: demand.query,
          category: demand.category,
        };
      }

      return {
        kind: 'category' as const,
        value: demand.category!,
        category: demand.category,
      };
    }),
  );

  return targets.length > 0 ? readyResult(targets) : emptyResult('no_valid_catalog_demand');
}

export async function loadHotTargets(maxQueries: number, staleMinutes: number): Promise<RefreshTargetLoadResult> {
  // Las prioridades del catálogo son datos públicos de lectura. Usar el
  // cliente de lectura evita que el scheduler se detenga si una credencial
  // privilegiada destinada a writes deja de ser válida.
  const supabase = getServerSupabaseReadClient();
  if (!supabase) {
    logger.warn('Catalog refresh: hot target load unavailable', {
      endpoint: '/api/admin/catalog-refresh',
      reason: 'read_client_unavailable',
    });
    return unavailableResult('read_client_unavailable');
  }

  const staleCutoff = new Date(Date.now() - staleMinutes * 60_000).toISOString();
  const { data, error } = await supabase
    .from('products')
    .select('id,name,category,last_scraped_at,refresh_priority')
    .in('refresh_priority', ['hot', 'tracked'])
    .lt('last_scraped_at', staleCutoff)
    .order('last_scraped_at', { ascending: true })
    .limit(Math.max(maxQueries * 2, 50));

  if (error || !data) {
    logger.warn('Catalog refresh: hot target load failed', {
      endpoint: '/api/admin/catalog-refresh',
      error: error?.message ?? 'unknown',
    });
    return unavailableResult('hot_target_query_failed');
  }

  const targets = dedupeTargets(
    data
      .map((row) => toQueryTarget({
        name: String(row.name ?? ''),
        category: typeof row.category === 'string' ? row.category : null,
      }))
      .filter((target): target is RefreshTarget => Boolean(target))
      .slice(0, maxQueries),
  );

  if (targets.length === 0) return emptyResult('no_stale_hot_targets');

  return readyResult(targets);
}

export async function buildRefreshPlan(
  input: RefreshInput,
  loaders: RefreshTargetLoader = { loadDemandTargets, loadTrackedTargets, loadHotTargets },
): Promise<RefreshPlan> {
  if (input.mode === 'cleanup-history') {
    return {
      source: 'cleanup-history',
      targets: [],
      fallbackApplied: false,
      fallbackReason: null,
    };
  }

  if (input.mode === 'full') {
    return {
      source: 'full-categories',
      targets: toCategoryTargets(input.categories),
      fallbackApplied: false,
      fallbackReason: null,
    };
  }

  if (input.mode === 'custom') {
    if (input.query) {
      return {
        source: 'custom-query',
        targets: dedupeTargets([{ kind: 'query', value: input.query, category: input.categories[0] }]),
        fallbackApplied: false,
        fallbackReason: null,
      };
    }

    return {
      source: 'custom-categories',
      targets: toCategoryTargets(input.categories),
      fallbackApplied: false,
      fallbackReason: null,
    };
  }

  if (input.mode === 'demand') {
    const demandTargets = await loaders.loadDemandTargets(input.maxQueries);
    if (demandTargets.status === 'ready' && demandTargets.targets.length > 0) {
      return {
        source: 'public-demand',
        targets: demandTargets.targets,
        fallbackApplied: false,
        fallbackReason: null,
      };
    }

    const hotTargets = await loaders.loadHotTargets(input.maxQueries, input.staleMinutes);
    if (hotTargets.status === 'ready' && hotTargets.targets.length > 0) {
      return {
        source: 'demand-fallback-hot',
        targets: hotTargets.targets,
        fallbackApplied: true,
        fallbackReason: demandTargets.reason ?? 'no_recent_catalog_demand',
      };
    }

    return {
      source: demandTargets.status === 'unavailable' ? 'demand-unavailable' : 'demand-idle',
      targets: [],
      fallbackApplied: false,
      fallbackReason: demandTargets.status === 'unavailable'
        ? demandTargets.reason ?? 'demand_source_unavailable'
        : null,
    };
  }

  if (input.mode === 'tracked') {
    const trackedTargets = await loaders.loadTrackedTargets(input.maxQueries);
    if (trackedTargets.status === 'ready' && trackedTargets.targets.length > 0) {
      return {
        source: 'tracked-db',
        targets: trackedTargets.targets,
        fallbackApplied: false,
        fallbackReason: null,
      };
    }

    if (trackedTargets.status === 'empty') {
      return {
        source: 'tracked-idle',
        targets: [],
        fallbackApplied: false,
        fallbackReason: null,
      };
    }

    return {
      source: 'tracked-unavailable',
      targets: [],
      fallbackApplied: false,
      fallbackReason: trackedTargets.reason ?? 'tracked_targets_unavailable',
    };
  }

  const hotTargets = await loaders.loadHotTargets(input.maxQueries, input.staleMinutes);
  if (hotTargets.status === 'ready' && hotTargets.targets.length > 0) {
    return {
      source: 'hot-db',
      targets: hotTargets.targets,
      fallbackApplied: false,
      fallbackReason: null,
    };
  }

  if (hotTargets.status === 'empty') {
    return {
      source: 'hot-idle',
      targets: [],
      fallbackApplied: false,
      fallbackReason: null,
    };
  }

  return {
    source: 'hot-unavailable',
    targets: [],
    fallbackApplied: false,
    fallbackReason: hotTargets.reason ?? 'hot_targets_unavailable',
  };
}
