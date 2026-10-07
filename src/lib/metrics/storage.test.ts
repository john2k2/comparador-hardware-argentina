import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server/supabase-server', () => ({ getServerSupabaseServiceClient: vi.fn(() => null) }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }));

import { getServerSupabaseServiceClient } from '@/lib/server/supabase-server';
import { logger } from '@/lib/logger';
import { persistTelemetryEntry, readPersistedTelemetryState, STORE_SCOPE, ENDPOINT_SCOPE } from './storage';
import type { EndpointRequestEvent, StoreScrapeEvent } from './types';
import { STORE_EVENT_LIMIT, ENDPOINT_EVENT_LIMIT, PERSISTED_EVENT_TTL_MS } from './constants';

const endpointEvent: EndpointRequestEvent = {
  endpoint: '/api/search', startedAtMs: 1000, finishedAtMs: 1100,
  latencyMs: 100, statusCode: 200, success: true, resultCount: 3,
};
const storeEvent: StoreScrapeEvent = {
  endpoint: '/api/search', storeId: 'fixture', storeName: 'Fixture', startedAtMs: 1000,
  finishedAtMs: 1100, latencyMs: 100, status: 'ok', resultCount: 3,
};

function useClient(client: unknown) {
  vi.mocked(getServerSupabaseServiceClient).mockReturnValue(client as ReturnType<typeof getServerSupabaseServiceClient>);
}

describe('persistTelemetryEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSupabaseServiceClient).mockReturnValue(null);
  });

  it.each([STORE_SCOPE, ENDPOINT_SCOPE])('comprueba ACK exitoso para %s con TTL y clave idempotente intactos', async (scope) => {
    const upsert = vi.fn(async () => ({ error: null }));
    useClient({ from: vi.fn(() => ({ upsert })) });
    const before = Date.now();
    await expect(persistTelemetryEntry(scope, 'fixture-key', endpointEvent)).resolves.toBeUndefined();
    const [row, options] = upsert.mock.calls[0] as unknown as [Record<string, unknown>, unknown];
    expect(row).toMatchObject({ cache_key: 'fixture-key', scope, payload: endpointEvent });
    expect(options).toEqual({ onConflict: 'cache_key' });
    expect(Date.parse(String(row.expires_at))).toBeGreaterThanOrEqual(before + PERSISTED_EVENT_TTL_MS);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it.each(['resolved-error', 'rejected'] as const)('%s es observable y registra recibo sin mensajes privados', async (mode) => {
    const failure = { code: '57014', message: 'PRIVATE-url-key-payload', details: 'PRIVATE' };
    const upsert = vi.fn(() => mode === 'rejected' ? Promise.reject(failure) : Promise.resolve({ error: failure }));
    useClient({ from: vi.fn(() => ({ upsert })) });
    await expect(persistTelemetryEntry(STORE_SCOPE, 'PRIVATE-key', storeEvent)).rejects.toThrow('OPERATIONAL_TELEMETRY_WRITE_FAILED');
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), { scope: STORE_SCOPE, code: '57014' });
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain('PRIVATE');
  });

  it.each([{ code: 'PRIVATE' }, new Error('PRIVATE-url'), 'PRIVATE'])('redacta scope desconocido y código inválido', async (failure) => {
    useClient({ from: vi.fn(() => ({ upsert: vi.fn(() => Promise.reject(failure)) })) });
    await expect(persistTelemetryEntry('PRIVATE-scope', 'PRIVATE-key', endpointEvent)).rejects.toThrow('OPERATIONAL_TELEMETRY_WRITE_FAILED');
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), { scope: 'unknown', code: null });
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain('PRIVATE');
  });

  it('sin cliente conserva el modo sin persistencia y no declara ACK', async () => {
    await expect(persistTelemetryEntry(STORE_SCOPE, 'key', storeEvent)).resolves.toBeUndefined();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('conserva lectura legacy por scope, expiración y límites', async () => {
    const queries: Array<{ scope?: string; cutoff?: string; limit?: number }> = [];
    useClient({ from: vi.fn(() => {
      const query = {} as typeof queries[number];
      queries.push(query);
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn((_column: string, scope: string) => { query.scope = scope; return builder; }),
        gt: vi.fn((_column: string, cutoff: string) => { query.cutoff = cutoff; return builder; }),
        order: vi.fn(() => builder),
        limit: vi.fn(async (limit: number) => {
          query.limit = limit;
          return { data: [{ payload: query.scope === STORE_SCOPE ? storeEvent : endpointEvent }], error: null };
        }),
      };
      return builder;
    }) });
    const state = await readPersistedTelemetryState(2000);
    expect(state).toEqual({ storeEvents: [storeEvent], endpointEvents: [endpointEvent] });
    expect(queries).toEqual([
      { scope: STORE_SCOPE, cutoff: '1970-01-01T00:00:02.000Z', limit: STORE_EVENT_LIMIT },
      { scope: ENDPOINT_SCOPE, cutoff: '1970-01-01T00:00:02.000Z', limit: ENDPOINT_EVENT_LIMIT },
    ]);
  });
});
