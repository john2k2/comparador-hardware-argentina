import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));

import { dispatchRequestedRefresh } from './dispatch';

const rpc = vi.fn();
const client = { rpc } as unknown as SupabaseClient;

describe('dispatchRequestedRefresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('GITHUB_ACTIONS_DISPATCH_TOKEN', '');
    rpc.mockResolvedValue({ data: { allowed: true }, error: null });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('never contacts GitHub without a configured token', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(dispatchRequestedRefresh(client)).resolves.toBe('unavailable');
    expect(rpc).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses distributed short and daily gates before dispatching the fixed workflow', async () => {
    vi.stubEnv('GITHUB_ACTIONS_DISPATCH_TOKEN', 'test-token');
    const fetchMock = vi.fn().mockResolvedValue({ status: 204 });
    vi.stubGlobal('fetch', fetchMock);
    await expect(dispatchRequestedRefresh(client)).resolves.toBe('sent');
    expect(rpc).toHaveBeenNthCalledWith(1, 'check_api_rate_limit', {
      p_bucket_key: 'requested-offer-refresh-dispatch-5m', p_limit: 1, p_window_seconds: 300,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'check_api_rate_limit', {
      p_bucket_key: 'requested-offer-refresh-dispatch-day', p_limit: 30, p_window_seconds: 86400,
    });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/actions/workflows/requested-offer-refresh.yml/dispatches');
    expect(options.body).toBe(JSON.stringify({ ref: 'main' }));
  });

  it('defers when another request has consumed the gate', async () => {
    vi.stubEnv('GITHUB_ACTIONS_DISPATCH_TOKEN', 'test-token');
    rpc.mockResolvedValueOnce({ data: { allowed: false }, error: null });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(dispatchRequestedRefresh(client)).resolves.toBe('deferred');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports unavailable when GitHub rejects the dispatch', async () => {
    vi.stubEnv('GITHUB_ACTIONS_DISPATCH_TOKEN', 'test-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 403 }));
    await expect(dispatchRequestedRefresh(client)).resolves.toBe('unavailable');
  });
});
