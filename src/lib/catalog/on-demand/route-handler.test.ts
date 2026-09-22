import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getServerSupabaseServiceClient: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/supabase-server', () => ({
  getServerSupabaseServiceClient: mocks.getServerSupabaseServiceClient,
}));

import { GET, POST } from './route-handler';

const target = { productId: 'cpu-5600', storeId: 'mexx', url: 'https://store.example/amd-ryzen-5-5600' };

function request(method: 'GET' | 'POST', path: string, options: { body?: string; origin?: string; headers?: Record<string, string> } = {}): NextRequest {
  const headers = new Headers(options.headers);
  if (options.origin !== undefined) headers.set('origin', options.origin);
  return new NextRequest(`http://localhost${path}`, { method, headers, body: options.body });
}

function post(body: string, options: { origin?: string; headers?: Record<string, string> } = {}) {
  return request('POST', '/api/catalog/on-demand', {
    ...options,
    body,
    headers: { 'content-type': 'application/json', ...options.headers },
  });
}

function publicJob(overrides: Record<string, unknown> = {}) {
  return {
    id: '123e4567-e89b-12d3-a456-426614174000',
    status: 'queued',
    targets: [target],
    results: [],
    created_at: '2026-09-21T12:00:00.000Z',
    started_at: null,
    finished_at: null,
    expires_at: '2099-09-21T12:00:00.000Z',
    ...overrides,
  };
}

describe('on-demand refresh route handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ENABLE_ON_DEMAND_REFRESH', '');
    vi.stubEnv('CATALOG_REFRESH_CRON_SECRET', '');
    vi.stubEnv('CRON_SECRET', '');
    mocks.getServerSupabaseServiceClient.mockReturnValue({ rpc: mocks.rpc, from: mocks.from });
    mocks.rpc.mockResolvedValue({ data: publicJob(), error: null });
  });

  it('returns 503 with the feature disabled without calling Supabase', async () => {
    const response = await POST(post(JSON.stringify({ targets: [target] }), { origin: 'http://localhost' }));

    expect(response.status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('rejects missing and cross-origin POST requests before touching Supabase', async () => {
    vi.stubEnv('ENABLE_ON_DEMAND_REFRESH', '1');
    vi.stubEnv('CATALOG_REFRESH_CRON_SECRET', 'test-cron-secret');

    const missingOrigin = await POST(post(JSON.stringify({ targets: [target] })));
    const crossOrigin = await POST(post(JSON.stringify({ targets: [target] }), { origin: 'https://attacker.example' }));

    expect(missingOrigin.status).toBe(403);
    expect(crossOrigin.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed JSON and 413 for bodies over 24 KiB without RPC', async () => {
    vi.stubEnv('ENABLE_ON_DEMAND_REFRESH', '1');
    vi.stubEnv('CATALOG_REFRESH_CRON_SECRET', 'test-cron-secret');

    const malformed = await POST(post('{"targets":', { origin: 'http://localhost' }));
    const oversized = await POST(post('x'.repeat(24_001), { origin: 'http://localhost' }));

    expect(malformed.status).toBe(400);
    expect(oversized.status).toBe(413);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('returns 400 for more than eight targets or unsafe target URLs', async () => {
    vi.stubEnv('ENABLE_ON_DEMAND_REFRESH', '1');
    vi.stubEnv('CATALOG_REFRESH_CRON_SECRET', 'test-cron-secret');
    const tooMany = Array.from({ length: 9 }, (_, index) => ({ ...target, productId: `cpu-${index}` }));
    const invalidTargets = [
      [{ ...target, url: 'javascript:alert(1)' }],
      [{ ...target, url: 'https://user:password@store.example/cpu' }],
    ];

    const responses = await Promise.all([
      POST(post(JSON.stringify({ targets: tooMany }), { origin: 'http://localhost' })),
      ...invalidTargets.map((targets) => POST(post(JSON.stringify({ targets }), { origin: 'http://localhost' }))),
    ]);

    expect(responses.map((response) => response.status)).toEqual([400, 400, 400]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('calls the RPC with only targets and a SHA-256 requester hash, then exposes only public job fields', async () => {
    vi.stubEnv('ENABLE_ON_DEMAND_REFRESH', '1');
    vi.stubEnv('CATALOG_REFRESH_CRON_SECRET', 'test-cron-secret');
    const ip = '203.0.113.10';
    const response = await POST(post(JSON.stringify({ targets: [target] }), {
      origin: 'http://localhost',
      headers: { 'cf-connecting-ip': ip },
    }));
    const payload = await response.json();
    const expectedDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`test-cron-secret:${ip}`));
    const expectedHash = Array.from(new Uint8Array(expectedDigest), (byte) => byte.toString(16).padStart(2, '0')).join('');

    expect(response.status).toBe(202);
    expect(mocks.rpc).toHaveBeenCalledWith('request_offer_refresh', {
      p_targets: [target],
      p_requester_hash: expectedHash,
    });
    expect(Object.keys(mocks.rpc.mock.calls[0][1])).toEqual(['p_targets', 'p_requester_hash']);
    expect(JSON.stringify(payload)).not.toMatch(/requester_hash|fingerprint|lease_token/);
  });

  it('maps the SQL rate-limit error to 429 with Retry-After 600', async () => {
    vi.stubEnv('ENABLE_ON_DEMAND_REFRESH', '1');
    vi.stubEnv('CATALOG_REFRESH_CRON_SECRET', 'test-cron-secret');
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'REFRESH_RATE_LIMIT' } });

    const response = await POST(post(JSON.stringify({ targets: [target] }), { origin: 'http://localhost' }));

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('600');
  });

  it('maps a missing offer to 409 and generic database failures to 503, never 202', async () => {
    vi.stubEnv('ENABLE_ON_DEMAND_REFRESH', '1');
    vi.stubEnv('CATALOG_REFRESH_CRON_SECRET', 'test-cron-secret');
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'REFRESH_OFFER_NOT_FOUND' } });
    const missing = await POST(post(JSON.stringify({ targets: [target] }), { origin: 'http://localhost' }));
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'database unavailable' } });
    const failed = await POST(post(JSON.stringify({ targets: [target] }), { origin: 'http://localhost' }));

    expect(missing.status).toBe(409);
    expect(failed.status).toBe(503);
    expect(failed.status).not.toBe(202);
  });

  it('rejects invalid GET UUIDs without querying the public job table', async () => {
    const response = await GET(request('GET', '/api/catalog/on-demand?id=not-a-uuid'));

    expect(response.status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('returns 503 when the GET status query fails', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message: 'database unavailable' } });
    const eq = vi.fn(() => ({ maybeSingle }));
    mocks.from.mockReturnValue({ select: vi.fn(() => ({ eq })) });

    const response = await GET(request('GET', '/api/catalog/on-demand?id=123e4567-e89b-12d3-a456-426614174000'));

    expect(response.status).toBe(503);
  });

  it('marks expired queued jobs as failed and selects only public columns', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: publicJob({ status: 'queued', expires_at: '2020-01-01T00:00:00.000Z', requester_hash: 'private', lease_token: 'private' }),
      error: null,
    });
    const eq = vi.fn(() => ({ maybeSingle }));
    mocks.from.mockReturnValue({ select: vi.fn(() => ({ eq })) });

    const response = await GET(request('GET', '/api/catalog/on-demand?id=123e4567-e89b-12d3-a456-426614174000'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.job.status).toBe('failed');
    expect(JSON.stringify(payload)).not.toMatch(/requester_hash|fingerprint|lease_token/);
    expect(mocks.from).toHaveBeenCalledWith('requested_offer_refreshes');
    expect(mocks.from.mock.results[0].value.select).toHaveBeenCalledWith('id,status,targets,results,created_at,started_at,finished_at,expires_at');
  });
});
