import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server/supabase-server', () => ({
  getServerSupabaseServiceClient: vi.fn(() => null),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { buildRefreshPlan, dedupeTargets, toQueryTarget } from '@/lib/admin/catalog-refresh/planning';
import type { RefreshInput } from '@/lib/admin/catalog-refresh/types';

const baseInput: RefreshInput = {
  mode: 'tracked',
  categories: ['procesadores'],
  stores: [],
  maxQueries: 10,
  staleMinutes: 180,
};

describe('catalog-refresh planning', () => {
  it('dedupes targets by kind/value/category', () => {
    expect(dedupeTargets([
      { kind: 'category', value: 'procesadores', category: 'procesadores' },
      { kind: 'category', value: 'procesadores', category: 'procesadores' },
      { kind: 'query', value: 'Ryzen 7600', category: 'procesadores' },
      { kind: 'query', value: 'ryzen 7600', category: 'procesadores' },
    ])).toHaveLength(2);
  });

  it('normalizes query targets and keeps valid categories only', () => {
    expect(toQueryTarget({ name: '  AMD   Ryzen 7 7800X3D  ', category: 'procesadores' })).toEqual({
      kind: 'query',
      value: 'AMD Ryzen 7 7800X3D',
      category: 'procesadores',
    });

    expect(toQueryTarget({ name: '   ', category: 'procesadores' })).toBeNull();
    expect(toQueryTarget({ name: 'RTX 5070', category: 'not-valid' })).toEqual({
      kind: 'query',
      value: 'RTX 5070',
      category: undefined,
    });
  });

  it('does not turn an unavailable tracked lookup into a full catalog scrape', async () => {
    await expect(buildRefreshPlan(baseInput, {
      loadDemandTargets: vi.fn(async () => ({ status: 'empty', targets: [] })),
      loadTrackedTargets: vi.fn(async () => ({
        status: 'unavailable',
        targets: [],
        reason: 'service_client_unavailable',
      })),
      loadHotTargets: vi.fn(async () => ({
        status: 'empty',
        targets: [],
        reason: 'no_stale_hot_targets',
      })),
    })).resolves.toEqual({
      source: 'tracked-unavailable',
      targets: [],
      fallbackApplied: false,
      fallbackReason: 'service_client_unavailable',
    });
  });

  it('returns idle tracked plan when there are no tracked targets', async () => {
    await expect(buildRefreshPlan(baseInput, {
      loadDemandTargets: vi.fn(async () => ({ status: 'empty', targets: [] })),
      loadTrackedTargets: vi.fn(async () => ({
        status: 'empty',
        targets: [],
        reason: 'no_tracked_ids',
      })),
      loadHotTargets: vi.fn(async () => ({
        status: 'empty',
        targets: [],
        reason: 'no_stale_hot_targets',
      })),
    })).resolves.toEqual({
      source: 'tracked-idle',
      targets: [],
      fallbackApplied: false,
      fallbackReason: null,
    });
  });

  it('uses loader-backed targets for hot mode when available', async () => {
    await expect(buildRefreshPlan({ ...baseInput, mode: 'hot' }, {
      loadDemandTargets: vi.fn(async () => ({ status: 'empty', targets: [] })),
      loadTrackedTargets: vi.fn(async () => ({
        status: 'empty',
        targets: [],
        reason: 'no_tracked_ids',
      })),
      loadHotTargets: vi.fn(async () => ({
        status: 'ready',
        targets: [{ kind: 'query', value: 'Ryzen 7600', category: 'procesadores' }],
      })),
    })).resolves.toEqual({
      source: 'hot-db',
      targets: [{ kind: 'query', value: 'Ryzen 7600', category: 'procesadores' }],
      fallbackApplied: false,
      fallbackReason: null,
    });
  });

  it('returns idle hot plan when there are no stale hot targets', async () => {
    await expect(buildRefreshPlan({ ...baseInput, mode: 'hot' }, {
      loadDemandTargets: vi.fn(async () => ({ status: 'empty', targets: [] })),
      loadTrackedTargets: vi.fn(async () => ({
        status: 'empty',
        targets: [],
        reason: 'no_tracked_ids',
      })),
      loadHotTargets: vi.fn(async () => ({
        status: 'empty',
        targets: [],
        reason: 'no_stale_hot_targets',
      })),
    })).resolves.toEqual({
      source: 'hot-idle',
      targets: [],
      fallbackApplied: false,
      fallbackReason: null,
    });
  });

  it('does not turn an unavailable hot lookup into a category sweep', async () => {
    await expect(buildRefreshPlan({ ...baseInput, mode: 'hot' }, {
      loadDemandTargets: vi.fn(async () => ({ status: 'empty', targets: [] })),
      loadTrackedTargets: vi.fn(async () => ({ status: 'empty', targets: [] })),
      loadHotTargets: vi.fn(async () => ({
        status: 'unavailable',
        targets: [],
        reason: 'hot_target_query_failed',
      })),
    })).resolves.toEqual({
      source: 'hot-unavailable',
      targets: [],
      fallbackApplied: false,
      fallbackReason: 'hot_target_query_failed',
    });
  });

  it('prioritizes recent public demand before the stale hot fallback', async () => {
    await expect(buildRefreshPlan({ ...baseInput, mode: 'demand' }, {
      loadDemandTargets: vi.fn(async () => ({
        status: 'ready',
        targets: [{ kind: 'query', value: 'RTX 5070', category: 'tarjetas-graficas' }],
      })),
      loadTrackedTargets: vi.fn(async () => ({ status: 'empty', targets: [] })),
      loadHotTargets: vi.fn(async () => ({ status: 'ready', targets: [] })),
    })).resolves.toEqual({
      source: 'public-demand',
      targets: [{ kind: 'query', value: 'RTX 5070', category: 'tarjetas-graficas' }],
      fallbackApplied: false,
      fallbackReason: null,
    });
  });

  it('uses hot products when there is no eligible public demand', async () => {
    await expect(buildRefreshPlan({ ...baseInput, mode: 'demand' }, {
      loadDemandTargets: vi.fn(async () => ({ status: 'empty', targets: [], reason: 'no_recent_catalog_demand' })),
      loadTrackedTargets: vi.fn(async () => ({ status: 'empty', targets: [] })),
      loadHotTargets: vi.fn(async () => ({
        status: 'ready',
        targets: [{ kind: 'query', value: 'Ryzen 7600', category: 'procesadores' }],
      })),
    })).resolves.toEqual({
      source: 'demand-fallback-hot',
      targets: [{ kind: 'query', value: 'Ryzen 7600', category: 'procesadores' }],
      fallbackApplied: true,
      fallbackReason: 'no_recent_catalog_demand',
    });
  });
});
