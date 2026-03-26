import { getServerSupabaseServiceClient } from '@/lib/server/supabase-server';
import { logger } from '@/lib/logger';
import { isHardwareCategory } from '@/lib/admin/catalog-refresh/input';
import {
  ALL_CATEGORIES,
  type RefreshInput,
  type RefreshPlan,
  type RefreshTarget,
} from '@/lib/admin/catalog-refresh/types';

export type RefreshTargetLoader = {
  loadTrackedTargets: (maxQueries: number) => Promise<RefreshTarget[]>;
  loadHotTargets: (maxQueries: number, staleMinutes: number) => Promise<RefreshTarget[]>;
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

export async function loadTrackedTargets(maxQueries: number): Promise<RefreshTarget[]> {
  const supabase = getServerSupabaseServiceClient();
  if (!supabase) return [];

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

  const trackedIds = new Set<string>();

  for (const row of favoritesResult.data ?? []) {
    const id = String(row.product_id ?? '').trim();
    if (id) trackedIds.add(id);
  }

  for (const row of alertsResult.data ?? []) {
    const id = String(row.product_id ?? '').trim();
    if (id) trackedIds.add(id);
  }

  if (trackedIds.size === 0) return [];

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
    return [];
  }

  return dedupeTargets(
    products
      .map((row) => toQueryTarget({
        name: String(row.name ?? ''),
        category: typeof row.category === 'string' ? row.category : null,
      }))
      .filter((target): target is RefreshTarget => Boolean(target))
      .slice(0, maxQueries),
  );
}

export async function loadHotTargets(maxQueries: number, staleMinutes: number): Promise<RefreshTarget[]> {
  const supabase = getServerSupabaseServiceClient();
  if (!supabase) return [];

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
    return [];
  }

  return dedupeTargets(
    data
      .map((row) => toQueryTarget({
        name: String(row.name ?? ''),
        category: typeof row.category === 'string' ? row.category : null,
      }))
      .filter((target): target is RefreshTarget => Boolean(target))
      .slice(0, maxQueries),
  );
}

export async function buildRefreshPlan(
  input: RefreshInput,
  loaders: RefreshTargetLoader = { loadTrackedTargets, loadHotTargets },
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

  if (input.mode === 'tracked') {
    const trackedTargets = await loaders.loadTrackedTargets(input.maxQueries);
    if (trackedTargets.length > 0) {
      return {
        source: 'tracked-db',
        targets: trackedTargets,
        fallbackApplied: false,
        fallbackReason: null,
      };
    }

    return {
      source: 'tracked-fallback-categories',
      targets: toCategoryTargets(input.categories),
      fallbackApplied: true,
      fallbackReason: 'tracked_targets_empty_or_unavailable',
    };
  }

  const hotTargets = await loaders.loadHotTargets(input.maxQueries, input.staleMinutes);
  if (hotTargets.length > 0) {
    return {
      source: 'hot-db',
      targets: hotTargets,
      fallbackApplied: false,
      fallbackReason: null,
    };
  }

  return {
    source: 'hot-fallback-categories',
    targets: toCategoryTargets(input.categories),
    fallbackApplied: true,
    fallbackReason: 'hot_targets_empty_or_unavailable',
  };
}
