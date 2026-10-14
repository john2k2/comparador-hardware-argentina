import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ after: vi.fn(), persist: vi.fn(), circuit: vi.fn(), clear: vi.fn(), failure: vi.fn(),
  state: { storeEvents: [], endpointEvents: [] } }));
vi.mock('next/server', () => ({ after: mocks.after }));
vi.mock('./storage', () => ({ persistTelemetryEntry: mocks.persist }));
vi.mock('./state', () => ({ getState: () => mocks.state, pushWithCap: (events: unknown[], event: unknown) => events.push(event) }));
vi.mock('./store-circuit-breaker', () => ({ getStoreCircuitState: mocks.circuit, clearStoreCircuit: mocks.clear, recordStoreCircuitFailure: mocks.failure }));
import { recordEndpointRequestEvent, recordStoreScrapeEvent, runObservedStoreScrape } from './recorder';

const endpoint = { endpoint: '/api/search' as const, startedAtMs: 1000, finishedAtMs: 1100, statusCode: 200, success: true, resultCount: 1 };
beforeEach(() => {
  vi.resetAllMocks(); mocks.state.storeEvents.length = 0; mocks.state.endpointEvents.length = 0;
  mocks.after.mockImplementation(() => { throw new Error('No request'); });
  mocks.persist.mockResolvedValue(undefined); mocks.circuit.mockResolvedValue(null);
  mocks.clear.mockResolvedValue(undefined); mocks.failure.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe('vida de persistencia operativa', () => {
  it('registra callback en after y captura un rechazo sin perder el evento en memoria', async () => {
    const tasks: Array<() => Promise<void>> = [];
    mocks.after.mockImplementation(task => tasks.push(task));
    mocks.persist.mockRejectedValue(new Error('PRIVATE'));
    await recordEndpointRequestEvent(endpoint);
    expect(tasks).toHaveLength(1); expect(mocks.persist).not.toHaveBeenCalled();
    expect(mocks.state.endpointEvents).toHaveLength(1);
    await expect(tasks[0]()).resolves.toBeUndefined();
    expect(mocks.persist.mock.calls[0][3]).toBeInstanceOf(AbortSignal);
  });
  it('fuera de HTTP devuelve una promesa que espera el ACK', async () => {
    let finish!: () => void;
    mocks.persist.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    let done = false;
    const task = Promise.resolve(recordStoreScrapeEvent({ endpoint: '/api/search', storeId: 'fixture', storeName: 'Fixture',
      startedAtMs: 1000, latencyMs: 100, resultCount: 1, status: 'ok' })).then(() => { done = true; });
    await Promise.resolve(); await Promise.resolve();
    expect(done).toBe(false); finish(); await task; expect(done).toBe(true);
  });
  it('aborta la escritura que no respondió al terminar el plazo', async () => {
    vi.useFakeTimers();
    let signal!: AbortSignal;
    mocks.persist.mockImplementation((_scope, _key, _event, input: AbortSignal) => {
      signal = input;
      return new Promise<void>((_resolve, reject) => input.addEventListener('abort', () => reject(input.reason), { once: true }));
    });
    const task = recordEndpointRequestEvent(endpoint);
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(task).resolves.toBeUndefined(); expect(signal.aborted).toBe(true);
  });
  it('el scrape CLI espera registro y circuito sin transformar un error de tienda en éxito', async () => {
    const run = vi.fn().mockRejectedValue(new Error('HTTP 403'));
    expect(await runObservedStoreScrape({ endpoint: '/api/search', storeId: 'fixture', storeName: 'Fixture', run })).toEqual([]);
    expect(mocks.persist).toHaveBeenCalledOnce(); expect(mocks.failure).toHaveBeenCalledOnce();
  });
});
