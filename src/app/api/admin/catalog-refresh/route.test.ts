import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnsureAccess = vi.fn();
const mockParseRefreshInput = vi.fn();
const mockCleanupPriceHistory = vi.fn();
const mockPruneGhostStorePrices = vi.fn();
const mockBuildRefreshPlan = vi.fn();
const mockRunTargets = vi.fn();
const mockLoggerInfo = vi.fn();
const mockLoggerError = vi.fn();

vi.mock('@/lib/admin/catalog-refresh/access', () => ({
  ensureAccess: mockEnsureAccess,
}));

vi.mock('@/lib/admin/catalog-refresh/input', () => ({
  parseRefreshInput: mockParseRefreshInput,
}));

vi.mock('@/lib/persistence/price-history-maintenance', () => ({
  cleanupPriceHistory: mockCleanupPriceHistory,
}));

vi.mock('@/lib/persistence/stale-product-prices-maintenance', () => ({
  pruneGhostStorePrices: mockPruneGhostStorePrices,
}));

vi.mock('@/lib/admin/catalog-refresh/planning', () => ({
  buildRefreshPlan: mockBuildRefreshPlan,
}));

vi.mock('@/lib/admin/catalog-refresh/execution', () => ({
  runTargets: mockRunTargets,
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: mockLoggerInfo,
    error: mockLoggerError,
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('/api/admin/catalog-refresh route', () => {
  beforeEach(() => {
    vi.resetModules();
    mockEnsureAccess.mockReset();
    mockParseRefreshInput.mockReset();
    mockCleanupPriceHistory.mockReset();
    mockPruneGhostStorePrices.mockReset();
    mockBuildRefreshPlan.mockReset();
    mockRunTargets.mockReset();
    mockLoggerInfo.mockReset();
    mockLoggerError.mockReset();
  });

  it('rejects GET because refresh is a mutating operation', async () => {
    const { GET } = await import('./route');
    const response = await GET(new NextRequest('http://localhost/api/admin/catalog-refresh'));

    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST,OPTIONS');
    expect(mockEnsureAccess).not.toHaveBeenCalled();
  });

  it('handles cleanup-history mode without invoking refresh targets', async () => {
    mockEnsureAccess.mockResolvedValue('admin');
    mockParseRefreshInput.mockResolvedValue({
      mode: 'cleanup-history',
      categories: [],
      stores: [],
      maxQueries: 40,
      staleMinutes: 180,
    });
    mockCleanupPriceHistory.mockResolvedValue({ deletedRows: 12, retainedRows: 34 });
    mockPruneGhostStorePrices.mockResolvedValue({ deletedRows: 4, scannedRows: 80, executedAt: '2026-08-29T18:00:00.000Z' });

    const { POST } = await import('./route');
    const response = await POST(new NextRequest('http://localhost/api/admin/catalog-refresh', { method: 'POST' }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.mode).toBe('cleanup-history');
    expect(payload.source).toBe('price-history-retention');
    expect(payload.cleanup).toEqual({ deletedRows: 12, retainedRows: 34 });
    expect(payload.stalePrices).toEqual({
      deletedRows: 4,
      scannedRows: 80,
      executedAt: '2026-08-29T18:00:00.000Z',
    });
    expect(mockPruneGhostStorePrices).toHaveBeenCalledOnce();
    expect(mockRunTargets).not.toHaveBeenCalled();
  });

  it('returns refresh summaries for normal execution and logs completion', async () => {
    mockEnsureAccess.mockResolvedValue('cron');
    mockParseRefreshInput.mockResolvedValue({
      mode: 'custom',
      query: 'ryzen 7600',
      categories: ['procesadores'],
      stores: ['mexx'],
      maxQueries: 10,
      staleMinutes: 180,
    });
    mockBuildRefreshPlan.mockResolvedValue({
      source: 'custom-query',
      targets: [{ kind: 'query', value: 'ryzen 7600', category: 'procesadores' }],
      fallbackApplied: false,
      fallbackReason: null,
    });
    mockRunTargets.mockResolvedValue([
      { target: 'ryzen 7600', kind: 'query', status: 200, productCount: 5, ok: true },
    ]);

    const { POST } = await import('./route');
    const response = await POST(new NextRequest('http://localhost/api/admin/catalog-refresh?mode=custom&q=ryzen%207600', { method: 'POST' }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.requestedBy).toBe('cron');
    expect(payload.source).toBe('custom-query');
    expect(payload.totalTargets).toBe(1);
    expect(payload.okTargets).toBe(1);
    expect(payload.failedTargets).toBe(0);
    expect(payload.results).toHaveLength(1);
    expect(payload.stalePrices).toBeNull();
    expect(mockPruneGhostStorePrices).not.toHaveBeenCalled();
    expect(mockLoggerInfo).toHaveBeenCalled();
  });

  it('prunes ghost store prices after a full refresh', async () => {
    mockEnsureAccess.mockResolvedValue('cron');
    mockParseRefreshInput.mockResolvedValue({
      mode: 'full',
      categories: [],
      stores: [],
      maxQueries: 40,
      staleMinutes: 180,
    });
    mockBuildRefreshPlan.mockResolvedValue({
      source: 'full-categories',
      targets: [{ kind: 'category', value: 'procesadores' }],
      fallbackApplied: false,
      fallbackReason: null,
    });
    mockRunTargets.mockResolvedValue([
      { target: 'procesadores', kind: 'category', status: 200, productCount: 8, ok: true },
    ]);
    mockPruneGhostStorePrices.mockResolvedValue({
      deletedRows: 7,
      scannedRows: 120,
      executedAt: '2026-08-29T18:00:00.000Z',
    });

    const { POST } = await import('./route');
    const response = await POST(new NextRequest('http://localhost/api/admin/catalog-refresh?mode=full', { method: 'POST' }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.mode).toBe('full');
    expect(payload.stalePrices).toEqual({
      deletedRows: 7,
      scannedRows: 120,
      executedAt: '2026-08-29T18:00:00.000Z',
    });
    expect(mockPruneGhostStorePrices).toHaveBeenCalledOnce();
  });

  it('skips execution when the refresh plan has no targets', async () => {
    mockEnsureAccess.mockResolvedValue('cron');
    mockParseRefreshInput.mockResolvedValue({
      mode: 'tracked',
      categories: [],
      stores: [],
      maxQueries: 30,
      staleMinutes: 180,
    });
    mockBuildRefreshPlan.mockResolvedValue({
      source: 'tracked-idle',
      targets: [],
      fallbackApplied: false,
      fallbackReason: null,
    });

    const { POST } = await import('./route');
    const response = await POST(new NextRequest('http://localhost/api/admin/catalog-refresh?mode=tracked', { method: 'POST' }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.source).toBe('tracked-idle');
    expect(payload.totalTargets).toBe(0);
    expect(payload.okTargets).toBe(0);
    expect(payload.failedTargets).toBe(0);
    expect(payload.results).toEqual([]);
    expect(mockRunTargets).not.toHaveBeenCalled();
  });
});
