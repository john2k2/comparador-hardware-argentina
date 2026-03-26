import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockLoggerWarn = vi.fn();
const mockLoggerError = vi.fn();

vi.mock('@/lib/logger', () => ({
  logger: {
    warn: mockLoggerWarn,
    error: mockLoggerError,
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('catalog-refresh execution', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockLoggerWarn.mockReset();
    mockLoggerError.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('retries retryable HTTP failures before succeeding', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ error: 'TEMP_UNAVAILABLE' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ products: [{ id: 'p1' }] }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const { runInternalRefresh } = await import('./execution');
    const promise = runInternalRefresh(
      new NextRequest('http://localhost/api/admin/catalog-refresh'),
      { kind: 'query', value: 'ryzen 7600', category: 'procesadores' },
      ['mexx'],
    );

    await vi.advanceTimersByTimeAsync(250);
    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.productCount).toBe(1);
    expect(mockLoggerWarn).toHaveBeenCalled();
  });

  it('retries transient fetch failures and returns timeout-style status on abort errors', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';

    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(abortError)
      .mockRejectedValueOnce(abortError);

    vi.stubGlobal('fetch', fetchMock);

    const { runInternalRefresh } = await import('./execution');
    const promise = runInternalRefresh(
      new NextRequest('http://localhost/api/admin/catalog-refresh'),
      { kind: 'category', value: 'procesadores', category: 'procesadores' },
      [],
    );

    await vi.advanceTimersByTimeAsync(250);
    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(504);
    expect(result.error).toBe('TIMEOUT_90000MS');
  });
});
