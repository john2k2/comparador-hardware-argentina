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

  it('falls back to categories when tracked targets are unavailable', async () => {
    await expect(buildRefreshPlan(baseInput, {
      loadTrackedTargets: vi.fn(async () => []),
      loadHotTargets: vi.fn(async () => []),
    })).resolves.toEqual({
      source: 'tracked-fallback-categories',
      targets: [{ kind: 'category', value: 'procesadores', category: 'procesadores' }],
      fallbackApplied: true,
      fallbackReason: 'tracked_targets_empty_or_unavailable',
    });
  });

  it('uses loader-backed targets for hot mode when available', async () => {
    await expect(buildRefreshPlan({ ...baseInput, mode: 'hot' }, {
      loadTrackedTargets: vi.fn(async () => []),
      loadHotTargets: vi.fn(async () => [{ kind: 'query', value: 'Ryzen 7600', category: 'procesadores' }]),
    })).resolves.toEqual({
      source: 'hot-db',
      targets: [{ kind: 'query', value: 'Ryzen 7600', category: 'procesadores' }],
      fallbackApplied: false,
      fallbackReason: null,
    });
  });
});
